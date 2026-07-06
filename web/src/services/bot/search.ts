// src/services/bot/structured.service.ts
import { getCachedSchema } from "@/lib/sanity/context"
import { createTenantMCPClient } from "@/lib/mcp-client"
import { streamText } from "ai"
import { google } from "@ai-sdk/google"
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

export async function handleSearch({
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
    // 2. Session-derived groqFilter — never from client input
    /*  const groqFilter = `_type in ["product", "category"] && tenantId == "${tenant.id}"`
     */
    // If each tenant has their own project — project boundary IS the tenant boundary
    // A simpler filter may be correct:
    const groqFilter = `_type in ["product"]`;
    // 3. Warm-load schema from Redis — eliminates initial_context tool call
    const initialContext = await getCachedSchema(tenant)


    if (!initialContext) {
        throw new Error(`[Route B][${tenant.companyName}] Schema context unavailable.`)
    }

    // 4. Tenant-scoped MCP client with groqFilter boundary
    const { mcp, mcpTools } = await createTenantMCPClient(
        tenant.id,
        groqFilter,
        { embeddings: true }
    )
    // ✅ Guard before spreading
    let mcpClosed = false
    const safeMcpClose = async () => {
        if (!mcpClosed) {
            mcpClosed = true
            await mcp.close()
        }
    }

    if (!mcpTools.groq_query) {
        await safeMcpClose()
        throw new Error(
            `[Route B][${tenant.companyName}] groq_query tool not found in MCP registry. ` +
            `Verify Context document is published and embeddings are enabled.`
        )
    }
    // Expose only semantic search — narrow tool list routes better
    const tools = {
        search_products: {
            ...mcpTools.groq_query,
            description:
                'Semantic search over the product catalog. Use for descriptive ' +
                'or vague natural language queries. Uses text::semanticSimilarity() ' +
                'for meaning-based ranking. NOT for exact SKU or price lookups.',
        },
    }

    // 5. Load conversation history — match your bot.ts pattern
    const history = await getConversationHistory(stateAdapter, chatId, 8)

    // ✅ Enhanced — labeled clearly
    const system = `
You are a product search assistant for ${tenant.companyName}.
Use search_products for all queries. Rank by semantic relevance.

TENANT CATALOG SCHEMA:
${initialContext}
🔴 MANDATORY MULTI-TENANT SECURITY GATE:
- Every single query you write MUST explicitly look up records matching our strict platform tenant identifier.
- You must always incorporate this exact expression directly inside your filters: _type == "product" && tenantId == "${tenant.id}" && status == "published"
- Example Correct Query: *[_type == "product" && tenantId == "${tenant.id}"] | score([name, description] match text::query("laptop"))[_score > 0]

Rules:
- Always use search_products. Never answer from memory.
- For vague queries, use text::semanticSimilarity() over title + description.
- Respond in ${intentResult.language === 'am' ? 'Amharic' : 'English'}.
`.trim()


    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system,
            messages: [
                ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
                { role: "user" as const, content: userText },
            ],
            tools,
            stopWhen: ({ steps }) => steps.length >= 4, onFinish: () => safeMcpClose(),
        })

        // ✅ Stream progressively to Telegram via rate-limit-aware abstraction
        // thread.post() handles chunking — NOT raw SSE to browser
        // ✅ Enhanced — log persistence failures explicitly, don't swallow them
        await thread.post(cleanMarkdownStream(result.textStream))
        const finalText = stripMarkdown(await result.text)

        // Persist both in parallel — faster, and both failures are visible
        await Promise.all([
            saveToHistory(stateAdapter, chatId, "user", userText),
            saveToHistory(stateAdapter, chatId, "assistant", finalText),
        ]).catch((err) => {
            // Non-blocking — user already received response
            // But log explicitly so you can detect history drift
            console.error(`[Route B][${tenant.companyName}] History persistence failed:`, err)
        })

    } catch (err: any) {
        await safeMcpClose() // ✅ ensure closure on error path
        console.error(`[Route B][${tenant.companyName}] Failure:`, err.message)
        throw err
    }
}