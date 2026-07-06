// src/services/bot/structured.service.ts
import { streamText } from "ai"
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format"
import type { TenantConfig } from "@/types/tenant"
import type { IntentResult } from "@/lib/ai/intent"
import type { Thread } from "chat"
import { createTenantRedisClient } from "@/lib/upstash"
import { createRedisState } from "@chat-adapter/state-redis"
import { createGateway } from '@ai-sdk/gateway';
import { BotServiceArgs } from "@/types/bot"
// ─── Gateway Initialization ───────────────────────────────────────────────
// Use the GOOGLE_API_KEY from your environment variables.
// We explicitly set autoTokenFetching to true so you don't need to manage keys.
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});


async function getConversationHistory(stateAdapter: any, threadId: string, limit = 8) {
    try {
        const key = `history:${threadId}`
        const history = await stateAdapter.getList?.(key)
        if (!history || !Array.isArray(history)) return []
        return history.slice(-limit)
    } catch (e) {
        console.error("[Memory] Failed to load history:", e)
        return []
    }
}

async function saveToHistory(
    stateAdapter: any,
    threadId: string,
    role: "user" | "assistant",
    content: string
) {
    try {
        const key = `history:${threadId}`
        await stateAdapter.appendToList?.(key, { role, content, timestamp: Date.now() })
    } catch (e) {
        console.error("[Memory] Failed to save history:", e)
    }
}

export async function handleGeneral({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Redis state — match your bot.ts pattern exactly
    const tenantRedisInstance = createTenantRedisClient(tenant)
    // The Compatibility Shunt that stops the crash:
    const stateAdapter = createRedisState({
        client: {
            // Redirect standard Key-Value commands directly to your working Upstash client
            get: (key: string) => tenantRedisInstance.get(key),
            set: (key: string, val: string) => tenantRedisInstance.set(key, val),
            del: (key: string) => tenantRedisInstance.del(key),
            // Mock the event listener hook to completely eliminate the .on() crash!
            on: (event: string, handler: Function) => {
                console.log(`[State Adapter Interface] Mocked listener registered for: ${event}`);
            }
        } as any
    });
    const history = await getConversationHistory(stateAdapter, chatId, 8)

    // ✅ Fixed — wrap in try/catch consistent with Services A and B
    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash-lite'),
            system: `You are a helpful assistant for ${tenant.companyName}.
Respond in ${intentResult.language === 'am' ? 'Amharic' : 'English'}.`,
            messages: [
                ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
                { role: "user" as const, content: userText },
            ],
        })

        await thread.post(cleanMarkdownStream(result.textStream))
        const finalText = stripMarkdown(await result.text)

        await Promise.all([
            saveToHistory(stateAdapter, chatId, "user", userText),
            saveToHistory(stateAdapter, chatId, "assistant", finalText),
        ]).catch((err) => {
            console.error(`[Route C][${tenant.companyName}] History persistence failed:`, err)
        })

    } catch (err: any) {
        console.error(`[Route C][${tenant.companyName}] Failure:`, err.message)
        throw err
    }

}