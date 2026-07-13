// src/services/bot/search.service.ts
import { getCachedSchema } from "@/lib/sanity/context";
import { createTenantMCPClient } from "@/lib/mcp-client";
import { streamText } from "ai";
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format";
import { createTenantRedisClient } from "@/lib/upstash";
import { createGateway } from '@ai-sdk/gateway';
import type { BotServiceArgs } from "@/types/bot";
import { getConversationHistory, saveToHistory } from "@/lib/ai/conversation";
import { createTenantWriteClient } from "@/sanity/client";
import { persistInsights } from "@/lib/ai/Insights";
// ─── 🟢 NEW: IMPORT THE MULTI-TENANT PROMPT ENGINE HOOKS ───
import { getAgentConfig, compileSystemPrompt } from "@/lib/sanity/getAgentConfig";

const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

export async function handleSearch({
    tenant,
    intentResult,
    thread,
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    console.log(`[Route B][${tenant.companyName}] Initializing dynamic product semantic search...`);

    // ─── 🟢 FIXED: BASELINE FALLBACKS DEFINED BEFORE THE PARALLEL FETCH FLIGHT ───
    const DEFAULT_SEARCH_PROMPT_BLUEPRINT = `
    You are a product search assistant for ${tenant.companyName}.
    Use search_products for all queries. Rank by semantic relevance.
    Every single query you write MUST explicitly look up records matching: _type == "product" && tenantId == "${tenant.id}"
    `.trim();

    const tenantRedisInstance = createTenantRedisClient(tenant);
    const groqFilter = `_type in ["product"]`;

    // ─── ⚡ OPTIMIZED PARALLEL INITIALIZATION BLOCK (CONCURRENT FLIGHT) ───
    // We execute all 4 independent data retrievals concurrently in parallel at the threshold!
    const [initialContext, { mcp, mcpTools }, rawHistory, cmsAgentConfig] = await Promise.all([
        getCachedSchema(tenant),
        createTenantMCPClient(tenant.id, groqFilter, { embeddings: true }),
        getConversationHistory(tenantRedisInstance, chatId, tenant).catch(() => []),
        getAgentConfig(tenant, "route-b") // 🟢 Loads dynamic text parameters for Route B (Support/Search)
    ]);

    if (!initialContext) {
        throw new Error(`[Route B][${tenant.companyName}] Schema context unavailable.`);
    }

    const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];

    // Always preserve and format at least the active user query message for the LLM
    const formattedMessages = [
        ...cleanHistory.map((msg: any) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        })),
        { role: "user" as const, content: userText },
    ];

    console.log(`[Route B][${tenant.companyName}] Compiled messages object array count: ${formattedMessages.length}`);

    let mcpClosed = false;
    const safeMcpClose = async () => {
        if (!mcpClosed) {
            mcpClosed = true;
            await mcp.close();
        }
    };

    if (!mcpTools.groq_query) {
        await safeMcpClose();
        throw new Error(
            `[Route B][${tenant.companyName}] groq_query tool not found in MCP registry. ` +
            `Verify Context document is published and embeddings are enabled.`
        );
    }

    if (!formattedMessages || formattedMessages.length === 0 || !formattedMessages.some(m => m.role === 'user')) {
        console.error(`[Route B Critical Shield] Terminating execution: Compiled payload array is empty or corrupted.`);
        await thread.post("Something went wrong processing your request tokens. Please submit your message again.");
        await safeMcpClose();
        return;
    }

    // Expose only semantic search tool to streamline and narrow agent choice routing paths
    const tools = {
        search_products: {
            ...mcpTools.groq_query,
            description:
                'Semantic search over the product catalog. Use for descriptive ' +
                'or vague natural language queries. Uses text::semanticSimilarity() ' +
                'for meaning-based ranking. NOT for exact SKU or price lookups.',
        },
    };

    // ─── 🟢 FIXED: ENHANCEMENT LOGGING FOR ACTIVE PROMPT SOURCES ───
    let activeSystemPrompt = "";
    if (cmsAgentConfig?.systemPrompt) {
        console.log(`[Route B][${tenant.companyName}] Using active Sanity system prompt: "${cmsAgentConfig.name}"`);

        activeSystemPrompt = compileSystemPrompt({
            rawPrompt: cmsAgentConfig.systemPrompt,
            tenant,
            initialContext: initialContext, // Passed cleanly without escaped raw JSON noise
            languageCode: intentResult.language || "en",
            intentName: intentResult.intent || "product_search",
            userText: userText,
            targetSlug: intentResult.params?.slug || undefined,
            cmsAgentConfig: cmsAgentConfig
        });
    } else {
        console.log(`[Route B][${tenant.companyName}] Sanity config missing or inactive — using hardcoded fallback blueprint`);
        activeSystemPrompt = DEFAULT_SEARCH_PROMPT_BLUEPRINT;
    }

    const activeFallbackMessage = cmsAgentConfig?.fallbackMessage ||
        "I searched our live semantic catalog but couldn't locate any products matching that description.";

    // ─── 🕐 ABSOLUTE TIME BUDGET GUARD ───
    const streamAbortController = new AbortController();
    const streamDeadline = setTimeout(() => {
        console.warn(`[Route B][${tenant.companyName}] Stream deadline exceeded — aborting AI stream.`);
        streamAbortController.abort();
    }, 25000);

    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system: activeSystemPrompt,
            messages: formattedMessages,
            tools,
            abortSignal: streamAbortController.signal, // True kill switch for serverless margins
            providerOptions: {
                gateway: {
                    models: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    order: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    timeout: 8000, // Balanced timing budget incorporating MCP latencies
                    production: true
                },
            },
            stopWhen: ({ steps }) => steps.length >= 4,
            onFinish: () => {
                clearTimeout(streamDeadline);
                safeMcpClose();
            },
        });

        // Progressive stream delivery channel to Telegram
        await thread.post(cleanMarkdownStream(result.textStream));
        clearTimeout(streamDeadline);

        const rawCapturedText = await result.text;
        const safeText = stripMarkdown(rawCapturedText).trim() || activeFallbackMessage;

        // ─── 🟢 FIX STEP 1: EXECUTE REDIS MEMORY SAVES IMMEDIATELY ───
        // We write the fresh user and assistant turns to Upstash Redis sequentially first
        console.log(`[Route B][${tenant.companyName}] Committing current turn to Redis list cache...`);
        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", safeText),
        ]).catch((err) => {
            console.error(`[Route B][${tenant.companyName}] History persistence failed:`, err);
        });

        // ─── 🟢 FIX STEP 2: LOAD REFRESHED FULL DIALOGUE STREAM ───
        // Pull the absolute freshest, growing history sequence straight from Redis with zero races!
        console.log(`[Route B][${tenant.companyName}] Fetching complete sequential history...`);
        const completelyUpdatedHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch(() => []);

        const finalPristineTelemetryList = completelyUpdatedHistory.map((msg) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        }));

        const writeClient = createTenantWriteClient({
            projectId: tenant.projectId,
            dataset: tenant.dataset || 'production',
            sanityApiToken: tenant.sanityApiToken,
            companyName: tenant.companyName
        });

        // ─── 🟢 FIX STEP 3: PERSIST INSIGHTS AS AN AWAITED FINALE BLOCK ───
        // Pass the fully updated, multi-turn history list array directly to Sanity Insights.
        // We await this path explicitly to force Vercel's runtime to keep the container open!
        console.log(`[Route B][${tenant.companyName}] Transmitting ${finalPristineTelemetryList.length} items to Sanity Insights...`);
        await persistInsights(writeClient, {
            agentId: `${tenant.subdomain}-search-agent`, // Explicit search agent identifier tag
            threadId: chatId,
            messages: finalPristineTelemetryList,
            intentName: intentResult.intent,
            language: intentResult.language
        }, tenant.companyName).catch((err) => {
            console.error(`❌ [Insights Drop][Route B] Telemetry write skipped:`, err.message);
        });

    } catch (err: any) {
        await safeMcpClose(); // Ensure safe closure on error path
        console.error(`[Route B][${tenant.companyName}] Failure:`, err.message);
        throw err;
    } finally {
        clearTimeout(streamDeadline);
        await safeMcpClose();
    }
}
