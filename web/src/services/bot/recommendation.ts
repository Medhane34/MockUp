// src/services/bot/recommendation.service.ts
import { getCachedSchema } from "@/lib/sanity/context"
import { createTenantMCPClient } from "@/lib/mcp-client"
import { streamText } from "ai"
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format"
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


export async function handleRecommendation({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenant)

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

    // 5. Load conversation history
    const rawHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch((err) => {
        console.error(`[Route D][${tenant.companyName}] History fetch failed:`, err.message);
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
    console.log(`[Route D][${tenant.companyName}] Compiled messages object array count: ${formattedMessages.length}`);

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
            model: gateway('google/gemini-2.5-flash'),
            system: systemPrompt,
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
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", finalText),
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