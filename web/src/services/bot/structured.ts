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
import { ConversationMessage, persistInsights } from "@/lib/ai/Insights"

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
    const [initialContext, { mcp, mcpTools }, rawHistory] = await Promise.all([
        getCachedSchema(tenant),
        createTenantMCPClient(tenant.id, groqFilter),
        getConversationHistory(tenantRedisInstance, chatId, tenant).catch((err) => {
            console.error(`[Route A][${tenant.companyName}] History fetch failed:`, err.message);
            return [];
        }),
    ]);
    console.log(`[Route A][${tenant.companyName}] Parallel init complete.`);

    if (!initialContext) {
        throw new Error(`[Route A][${tenant.companyName}] Schema context unavailable.`)
    }

    const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];

    // Always preserve and format at least the active user query message
    /* const formattedMessages: ConversationMessage[] = [
        ...cleanHistory.map((msg: any) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        })),
        { role: "user" as const, content: userText },
    ]; */

    const slugHint = intentResult.intent === 'product_detail' && intentResult.params?.slug
        ? `The user is asking about a specific product. Slug hint: "${intentResult.params.slug}". 
     Try: *[_type == "product" && slug.current == "${intentResult.params.slug}"][0]{...}
     If that returns nothing, fallback to: *[_type == "product" && name match "${intentResult.params.slug}*"][0]{...}`
        : intentResult.intent === 'product_detail'
            ? `The user asked about: "${userText}". 
     Extract the product name and search with: *[_type == "product" && name match "extracted_name*"][0]{...}`
            : ''
    // ✅ Fixed — track closure state
    let mcpClosed = false
    const safeMcpClose = async () => {
        if (!mcpClosed) {
            mcpClosed = true
            await mcp.close()
        }
    }



    const systemPrompt = `
You are a sales assistant for ${tenant.companyName}.
Use tools to answer product questions.

TENANT SCHEMA:
${initialContext}

CRITICAL SCHEMA FACTS — memorize these before writing any query:
- Product type is exactly: _type == "product"
- SKU field is: ProductSku (capital P — NOT productSku)
-  slug is an OBJECT — always query with slug.current:
  *[_type == "product" && slug.current == "mac-book-pro"]
- To filter by category name: categoryRef->title == "Electronics"
- To get category name in projection: categoryRef->{title}
- Never assume a product doesn't exist after one failed query.
  Try alternative field combinations before saying nothing was found.
- Always use groq_query tool. Never answer from memory.
- Respond in ${intentResult.language === 'am' ? 'Amharic (በአማርኛ)' : 'English'}.
- Product Display Name: name, price, description, features
- Category Array Reference field name: categoryRef
- Product Slug Object: slug.current (Never query slug directly as an object, always check slug.current)

QUERY RULES:
- Always start with a broad query if unsure — never assume a product doesn't exist
- For name search: *[_type == "product" && name match $searchTerm]
- For all products: *[_type == "product"]{name, ProductSku, price, inStock, categoryRef->{title}}
- Never use "productSku" lowercase — always use "ProductSku" capital P
- Never query slug as a plain string 
- For "mac book pro" or similar — try both slug and name match

🔴 CRITICAL TOOL EXECUTION RULES (PREVENT COMPILATION CRASHES):
1. NEVER use dollar-sign parameters (e.g. $searchTerm, $categoryName) inside the tool query string. The JSON-RPC tool cannot parse variables. You must write literal strings directly into the query text.
2. For item details or name searches, ALWAYS use case-insensitive lower-case matching filters combined with a wildcard star operator (*) to handle space discrepancies safely.
3. Example Correct Name Lookup: *[_type == "product" && lower(name) match lower("macbook*")]{ name, ProductSku, price, inStock, description }
4. Example Correct SKU Lookup: *[_type == "product" && lower(ProductSku) == lower("mac-pro-256")]{ name, ProductSku, price, description }
5. Because categories are stored inside an array reference field, you must ALWAYS use the GROQ "in" operator combined with a dereferenced loop lookup path to scan for matches.
6. You MUST call the 'groq_query' tool for EVERY single product, catalog, category, or detail question. 
7. If you cannot extract a precise slug, you MUST call 'groq_query' with a broad wildcard matching statement to search by name.

ANTI-HALLUCINATION RULES:
1. NEVER invent categories or products not returned by a live tool lookup.
2. If groq_query returns an empty dataset [], respond: "I searched our live catalog but couldn't find any products matching that description. Would you like to see our full product list?"
3. Never use $parameters inside the groq_query tool string — write literal text values only.
4. Never reference a "status" field — it does not exist in this catalog database.
5. For category search example: *[_type == "product" && categoryRef->title match "Electronics*"]{name, ProductSku, price, inStock, "category": categoryRef->title}
6. For all products retrieval example: *[_type == "product"]{name, ProductSku, price, inStock, "category": categoryRef->title}
7. Never use $parameters inside the groq_query tool string — write literal text values only.

🔴 KEYWORD MATCHING RULE FOR CATEGORY ARRAYS:
- Users often add descriptive noise (e.g. typing "electronics category" or "electronics products").
- When looking up references, NEVER match the whole phrase string. Split the text, isolate the core category word (e.g. "electronics"), and match it with a wildcard star (*).
- Correct Category Search Blueprint: *[_type == "product" && count((categoryRef[]->title)[@ match "electronics*"]) > 0]{name, ProductSku, price, inStock, "category": categoryRef[]->title}
- Broad Total Items Retrieval Blueprint: *[_type == "product"]{name, ProductSku, price, inStock, "category": categoryRef[]->title}

CATEGORY QUERY RULES:
- NEVER use match for category filtering — use exact == equality only
- CORRECT: *[_type == "product" && categoryRef->title == "Electronics"]
- WRONG:   *[_type == "product" && categoryRef->title match "electronics*"]
- When user asks for a category, map their words to the exact titles above
- If unsure which category matches, fetch ALL products instead:
  *[_type == "product"]{name, ProductSku, price, inStock, "category": categoryRef->title}

QUERY BLUEPRINTS:
- For category browsing lookup example (Matches "electronics products" or "electronics"): 
  *[_type == "product" && "electronics*" in categoryRef[]->title]{name, ProductSku, price, inStock, "category": categoryRef[]->title}
  
- For generic category discovery matching text variations:
  *[_type == "product" && any(categoryRef[]->title match ["electronics*", "gadgets*"])]{name, ProductSku, price}

- For a specific name search lookup: 
  *[_type == "product" && lower(name) match lower("macbook*")]{name, ProductSku, price, inStock, description}

- For all products retrieval summary: 
  *[_type == "product"]{name, ProductSku, price, inStock, "categories": categoryRef[]->title}

${slugHint}
`.trim()

    /*     const sdkCompatibleTools: Record<string, any> = {};
        Object.keys(mcpTools).forEach((toolName) => {
            const tool = mcpTools[toolName];
            sdkCompatibleTools[toolName] = {
                // Keep Sanity's exact description and parameters mapping layout untouched
                description: tool.description,
                parameters: tool.inputSchema || tool.parameters,
                execute: async (args: any) => {
                    console.log(`[Route A][Tool Invocation: ${toolName}] Executing query: ${args.query}`);
                    // Route the request securely through your trace-correlated JSON-RPC context engine file
                    return await runSanityContextQuery(tenant, args.query);
                }
            };
        });
     */

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
            system: systemPrompt,
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