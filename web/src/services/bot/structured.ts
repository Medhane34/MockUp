// src/services/bot/structured.service.ts
import { getCachedSchema } from "@/lib/sanity/context"
import { createTenantMCPClient } from "@/lib/mcp-client"
import { streamText } from "ai"
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format"
import { createTenantRedisClient } from "@/lib/upstash"
import { createGateway } from '@ai-sdk/gateway';
import { BotServiceArgs } from "@/types/bot"
import { getConversationHistory, saveToHistory } from "@/lib/ai/conversation"

import { createTenantWriteClient } from "@/sanity/client"
import { persistInsights } from "@/lib/ai/Insights"
import { getAgentConfig, compileSystemPrompt } from "@/lib/sanity/getAgentConfig";
// ─── Gateway Initialization ───────────────────────────────────────────────
// Use the GOOGLE_API_KEY from your environment variables.
// We explicitly set autoTokenFetching to true so you don't need to manage keys.
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

export async function handleStructured({
    tenant,
    intentResult,
    thread,      // ← Telegram thread abstraction
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    // 1. Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenant)

    // 2. Session-derived groqFilter — never from client input
    // If each tenant has their own project — project boundary IS the tenant boundary
    const groqFilter = `_type in ["product", "category", "faq"]`

    // ─── ⚡ PARALLEL INIT: Run all 3 independent async operations concurrently ───
    // Previously these ran sequentially: getCachedSchema → createTenantMCPClient → getConversationHistory
    // createTenantMCPClient alone makes 3 internal network calls (getTenantConfig + Sanity HTTP + mcp.tools())
    // which could consume 3–8s BEFORE the two cheap Redis calls even started.
    // Promise.all lets all 3 race in parallel — total time = slowest one, not their sum.
    // Upstash REST is stateless — lrange never blocks on a connection handshake.
    console.log(`[Route A][${tenant.companyName}] Starting parallel init: schema + MCP + history...`);



    const DEFAULT_PROMPT_BLUEPRINT = `
    You are a professional sales assistant for ${tenant.companyName}.
    Use your available tools to perform real-time inventory and catalog lookups.
    Respond gracefully using the active user intent parameters.
    `.trim();
    const [initialContext, { mcp, mcpTools }, rawHistory, cmsAgentConfig] = await Promise.all([
        getCachedSchema(tenant),
        createTenantMCPClient(tenant.id, groqFilter),
        getConversationHistory(tenantRedisInstance, chatId, tenant).catch((err) => {
            console.error(`[Route A][${tenant.companyName}] History fetch failed:`, err.message);
            return [];
        }),
        getAgentConfig(tenant, "route-a")
    ]);
    console.log(`[Route A][${tenant.companyName}] Parallel init complete.`);

    if (!initialContext) {
        throw new Error(`[Route A][${tenant.companyName}] Schema context unavailable.`)
    }

    const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];
    // ✅ Fixed — track closure state
    let mcpClosed = false
    const safeMcpClose = async () => {
        if (!mcpClosed) {
            mcpClosed = true
            await mcp.close()
        }
    }

    // ─── 🟢 FIX: DYNAMICALLY WIRE THE ACTIVE SYSTEM PROMPT TEXT ───
    let activeSystemPrompt = "";
    if (cmsAgentConfig?.systemPrompt) {
        console.log(`[Route A][${tenant.companyName}] Using active Sanity system prompt: "${cmsAgentConfig.name}"`);

        activeSystemPrompt = compileSystemPrompt({
            rawPrompt: cmsAgentConfig.systemPrompt,
            tenant,
            initialContext: initialContext, // Passed cleanly (Issue 3 Fixed)
            languageCode: intentResult.language || "en",
            intentName: intentResult.intent || "product_search",
            userText: userText,
            rawSlugHintTemplate: cmsAgentConfig.slugHintTemplate, // Loaded dynamically from CMS (Issue 4 Fixed)
            targetSlug: intentResult.intent === 'product_detail' ? intentResult.params?.slug : undefined,
            cmsAgentConfig: cmsAgentConfig

        });
    } else {
        console.log(`[Route A][${tenant.companyName}] Sanity config missing or inactive — falling back to hardcoded blueprint string`);
        activeSystemPrompt = DEFAULT_PROMPT_BLUEPRINT;
    }

    try {
        // ─── 🛡️ FIX: Capture final text in onFinish to avoid double-consuming the stream ───
        // Previously: `await result.text` was called AFTER thread.post had already drained the stream
        // — causing a hang that triggered the 60s Vercel timeout.
        // Now: text is captured inside onFinish, stream is consumed exactly once via thread.post.
        let capturedFinalText = ""

        // ─── 🕐 ABSOLUTE TIME BUDGET GUARD ───
        // Vercel's limit is 60s. Pre-route work (intent, registry, buyer) consumes ~3-5s.
        // We give the AI stream a hard 25s deadline, leaving 30+ seconds of margin.
        // When this fires, abortSignal propagates into streamText AND thread.post's for-await loop,
        // causing both to exit cleanly while onFinish captures whatever text was generated.
        const streamAbortController = new AbortController()
        const streamDeadline = setTimeout(() => {
            console.warn(`[Route A][${tenant.companyName}] Stream deadline exceeded — aborting AI stream.`)
            streamAbortController.abort()
        }, 25000)

        const formattedMessages = [
            ...cleanHistory,
            { role: 'user' as const, content: userText }
        ]

        // ─── 🛡️ FIX 2: RUNTIME VALIDATION SHIELD GUARDS ───
        console.log(`[Route A][${tenant.companyName}] Compiled messages object array count: ${formattedMessages.length}`);
        if (!formattedMessages || formattedMessages.length === 0 || !formattedMessages.some(m => m.role === 'user')) {
            console.error(`[Route A Critical Shield] Terminating execution: Compiled payload array is empty or corrupted.`);
            await thread.post("Something went wrong processing your request tokens. Please submit your message again.");
            await safeMcpClose();
            return;
        }
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system: activeSystemPrompt,
            messages: formattedMessages,
            tools: mcpTools,
            maxRetries: 1, // ⬇️ Reduced from 3 — each retry on timeout multiplies latency
            abortSignal: streamAbortController.signal, // 🔌 True kill switch for the stream
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
                    // 8 seconds gives gemini-2.5-flash enough time for a single MCP tool
                    // round-trip (GROQ query → network → response). 2500ms was too low
                    // and caused cascading fallbacks that multiplied latency.
                    timeout: 8000,
                    production: true
                },
            },
            stopWhen: ({ steps }) => steps.length >= 2, // ⬇️ Reduced from 3 — fewer MCP round-trips
            onFinish: (event) => {
                console.log(`[Route A] Finish reason: ${event.finishReason}`)
                console.log(`[Route A] Steps taken: ${event.steps?.length}`)
                console.log(`[Route A] Final text length: ${event.text?.length}`)
                console.log(`[Route A] Final text preview: "${event.text?.substring(0, 150)}"`)

                if (event.finishReason === 'error') {
                    console.error(`[Route A] STREAM ERROR:`, JSON.stringify(event.response))
                    console.error(`[Route A] Last step:`, JSON.stringify(event.steps?.at(-1)))
                }

                // ✅ Capture text here — avoids a second await after stream is consumed
                capturedFinalText = event.text ?? ""
                clearTimeout(streamDeadline) // Cancel deadline if stream finishes naturally first
                safeMcpClose()
            },
        })

        // ✅ Consume the stream exactly ONCE via thread.post.
        // The abortController.signal is wired into streamText above — when it fires,
        // streamText terminates the textStream generator, which ends the for-await in
        // route.ts naturally without needing to pass the signal here.
        await thread.post(cleanMarkdownStream(result.textStream))

        // Ensure deadline timer is always cleared (onFinish clears it on success; clear here on error path)
        clearTimeout(streamDeadline)

        // Use text captured from onFinish (already resolved by the time stream drains)
        const safeText = stripMarkdown(capturedFinalText).trim()
            || "I found your catalog but couldn't format a response. Please try again."
        /* const writeClient = createTenantWriteClient(tenant); */
        // Instantiate your explicit write-capable client passing down destructuring slices

        // Persist both in parallel — faster, and both failures are visible
        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", safeText),
        ]).catch((err) => {
            // Non-blocking — user already received response
            // Log explicitly so you can detect history drift
            console.error(`[Route A][${tenant.companyName}] History persistence failed:`, err)
        })

        const completelyUpdatedHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch(() => []);
        const finalPristineTelemetryList = completelyUpdatedHistory.map((msg) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        }));
        const writeClient = createTenantWriteClient({
            projectId: tenant.projectId,
            dataset: tenant.dataset || 'production',
            sanityApiToken: tenant.sanityApiToken, // Enforce Editor-role token
            companyName: tenant.companyName
        });
        // ─── 🟢 STEP 3: AWAIT THE FINALE TELEMETRY WRITE ───
        // We add the 'await' keyword right before calling persistInsights.
        // This forces Vercel to hold the serverless thread container open until the full history array syncs!
        console.log(`[Route A][${tenant.companyName}] Transmitting ${finalPristineTelemetryList.length} items to Sanity Insights...`);

        console.log(`[Insights Debug] agentId: ${tenant.subdomain}-sales-agent`)
        console.log(`[Insights Debug] threadId: ${chatId}`)
        console.log(`[Insights Debug] projectId: ${tenant.projectId}`)
        console.log(`[Insights Debug] messages count: ${finalPristineTelemetryList.length}`)
        try {
            console.log(`[Route A][${tenant.companyName}] Transmitting full timeline to Sanity for thread: ${chatId}`);

            await persistInsights(writeClient, {
                agentId: `${tenant.subdomain}-sales-agent`,
                threadId: chatId, // Verified unique user chatId parameter
                messages: finalPristineTelemetryList,
                intentName: intentResult.intent,
                language: intentResult.language
            }, tenant.companyName);

            console.log(`✅ [Telemetry Sync Success][${tenant.companyName}] Sealed thread: ${chatId}`);
        } catch (telemetryError: any) {
            // This will now catch and print the exact reason User B is failing!
            console.error(`❌ [Route A Telemetry Crash] Write failed for thread [${chatId}]:`, telemetryError.message);
        }
    } catch (err: any) {
        await safeMcpClose() // ✅ ensure closure on error path
        console.error(`[Route A][${tenant.companyName}] Failure:`, err.message)
        throw err
    }
}