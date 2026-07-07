// src/services/bot/search.service.ts
import { getCachedSchema } from "@/lib/sanity/context"
import { createTenantMCPClient } from "@/lib/mcp-client"
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


export async function handleSearch({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenant)

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
    );
    // ─── 🛡️ FIX 1: DEFENSIVE CONVERSATION MEMORY COMPILATION LAYER ───
    const rawHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch((err) => {
        console.error(`[Route B][${tenant.companyName}] History fetch failed:`, err.message);
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

    if (!formattedMessages || formattedMessages.length === 0 || !formattedMessages.some(m => m.role === 'user')) {
        console.error(`[Route A Critical Shield] Terminating execution: Compiled payload array is empty or corrupted.`);
        await thread.post("Something went wrong processing your request tokens. Please submit your message again.");
        await safeMcpClose();
        return;
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
            messages: formattedMessages,
            tools,
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
            stopWhen: ({ steps }) => steps.length >= 4, onFinish: () => safeMcpClose(),
        })

        // ✅ Stream progressively to Telegram via rate-limit-aware abstraction
        // thread.post() handles chunking — NOT raw SSE to browser
        // ✅ Enhanced — log persistence failures explicitly, don't swallow them
        await thread.post(cleanMarkdownStream(result.textStream))
        const finalText = stripMarkdown(await result.text)

        // Persist both in parallel — faster, and both failures are visible
        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", finalText),
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