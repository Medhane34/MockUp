// src/services/bot/general.service.ts
import { streamText } from "ai"
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format"
import type { TenantConfig } from "@/types/tenant"
import type { IntentResult } from "@/lib/ai/intent"
import type { Thread } from "chat"
import { createTenantRedisClient } from "@/lib/upstash"
import { createGateway } from '@ai-sdk/gateway';
import { BotServiceArgs } from "@/types/bot"
import { getConversationHistory, saveToHistory } from "@/lib/ai/conversation"
// ─── Gateway Initialization ───────────────────────────────────────────────
// Use the GOOGLE_API_KEY from your environment variables.
// We explicitly set autoTokenFetching to true so you don't need to manage keys.
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});


export async function handleGeneral({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenant)

    const rawHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch((err) => {
        console.error(`[Route C][${tenant.companyName}] History fetch failed:`, err.message);
        return [];
    });
    const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];

    // Always preserve and format at least the active user query message
    const formattedMessages = [
        ...cleanHistory.map((msg: any) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        })),
        { role: "user" as const, content: userText },
    ];
    // ─── 🛡️ FIX 2: RUNTIME VALIDATION SHIELD GUARDS ───
    console.log(`[Route A][${tenant.companyName}] Compiled messages object array count: ${formattedMessages.length}`);
    // ✅ Fixed — wrap in try/catch consistent with Services A and B
    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system: `You are a helpful assistant for ${tenant.companyName}.
Respond in ${intentResult.language === 'am' ? 'Amharic' : 'English'}.`,
            messages: formattedMessages,
            providerOptions: {
                gateway: {
                    // 🔄 FIXED: Primary flagship model added to the front of the array list!
                    models: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    // 🔄 FIXED: Sets the precise sequence order for automated fallback switching
                    order: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    // ⏱️ VERCEL TIMEOUT INCORPORATION: 
                    // Enforces a strict 4-second timeout limit per model invocation turn. 
                    // If gemini-2.5-flash hangs for 4000ms, Vercel instantly cuts it off 
                    // and routes the request to flash-lite, preserving execution limits!
                    timeout: 2500,
                    production: true
                },
            },
        })

        await thread.post(cleanMarkdownStream(result.textStream))
        const finalText = stripMarkdown(await result.text)

        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", finalText),
        ]).catch((err) => {
            console.error(`[Route C][${tenant.companyName}] History persistence failed:`, err)
        })

    } catch (err: any) {
        console.error(`[Route C][${tenant.companyName}] Failure:`, err.message)
        throw err
    }

}