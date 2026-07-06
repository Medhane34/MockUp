// src/services/bot/structured.service.ts
import { getCachedSchema } from "@/lib/sanity/context"
import { createTenantMCPClient } from "@/lib/mcp-client"
import { streamText } from "ai"
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format"
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



export async function handleRecommendation({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Redis state — match your bot.ts pattern exactly
    const tenantRedisInstance = createTenantRedisClient(tenant)
    const stateAdapter = createRedisState({ client: tenantRedisInstance as any })
    // 2. 🔍 LOOKUP EXTRACTOR: Fetch user's qualified BANT survey details from cache memory
    // (This pulls your automated button tracking profiles that the buyer completed earlier)
    const qualificationKey = `qualification:${chatId}`;
    let cachedBantData: any = null;
    try {
        const rawBant = await tenantRedisInstance.get(qualificationKey);
        cachedBantData = rawBant ? (typeof rawBant === "string" ? JSON.parse(rawBant) : rawBant) : null;
        console.log(`[Route D][${tenant.companyName}] Retrieved cached buyer BANT profiles:`, cachedBantData);
    } catch (e) {
        console.warn("[Route D] Qualification profile read miss — continuing with fallback parameters.");
    }

    // Extract structural boundaries cleanly, fallback safely to standard catalog metrics
    const userBudget = cachedBantData?.budgetRange || "General";
    const userInterests = cachedBantData?.interests || [];

    // 2. Session-derived groqFilter — never from client input
    /*  const groqFilter = `_type in ["product", "category"] && tenantId == "${tenant.id}"`
     */
    // If each tenant has their own project — project boundary IS the tenant boundary
    // A simpler filter may be correct:
    const groqFilter = `_type in ["product", "category", "faq"]`;
    // 3. Warm-load schema from Redis — eliminates initial_context tool call
    const initialContext = await getCachedSchema(tenant)
    if (!initialContext) {
        throw new Error(`[Route D][${tenant.companyName}] Schema context unavailable.`)
    }

    // 4. Tenant-scoped MCP client with groqFilter boundary
    const { mcp, mcpTools } = await createTenantMCPClient(tenant.id, groqFilter)

    // 5. Load conversation history — match your bot.ts pattern
    const history = await getConversationHistory(stateAdapter, chatId, 8)

    const systemPrompt = `
You are an expert sales consultancy advisor for ${tenant.companyName}.
Your primary role is evaluating customer preferences and matching them to our inventory database rows.

TENANT SYSTEM CATALOG SCHEMA:
${initialContext}

ACTIVE SHOPPER PREFERENCE CONTEXT (BANT METRICS):
- Current Survey Budget Filter Stage: ${userBudget}
- Explicit Shopper Product Category Focus: ${userInterests.join(", ") || "Open Catalog Discovery"}

CRITICAL MATCHING RULES:
- You must prioritize products that align with the user's saved Budget Filter Stage and Category Focus.
- Use provided tools exclusively for all database checks. Never make up item options from memory.
- Offer exactly 2-3 personalized product options that best fit their description. Highlight why they fit.
- Conclude by guiding them to choose their preferred model by replying with "buy [product-name]".
- Respond in the user's detected target language: ${intentResult.language === 'am' ? 'Amharic (በአማርኛ)' : 'English'}.
`.trim();

    // ✅ Fixed — track closure state
    let mcpClosed = false
    const safeMcpClose = async () => {
        if (!mcpClosed) {
            mcpClosed = true
            await mcp.close()
        }
    }
    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash-lite'),
            system: systemPrompt,
            messages: [
                ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
                { role: "user" as const, content: userText },
            ],
            tools: mcpTools,   // ✅ direct — no manual mapping
            stopWhen: ({ steps }) => steps.length >= 4,
            onFinish: () => safeMcpClose(),
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
            console.error(`[Route D][${tenant.companyName}] History persistence failed:`, err)
        })

    } catch (err: any) {
        await safeMcpClose() // ✅ ensure closure on error path
        console.error(`[Route D][${tenant.companyName}] Failure:`, err.message)
        throw err
    }
}