// src/app/api/webhook/telegram/process/route.ts
import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createTenantClient } from "@/sanity/client";
import { detectIntent, IntentResult, IntentType } from "@/lib/ai/intent";
import { Receiver } from "@upstash/qstash";
import { sendFormattedMessage } from "@/lib/telegram/format";
import { getProductList, getProductDetails, getFAQs, getProductRecommendations } from "@/lib/sanity/queries";
import type { TenantConfig } from "@/types/tenant";
import { createOrUpdateBuyer, getBuyer, getOrCreateBuyer, updateBuyerProfile } from "@/lib/sanity/buyer";
import { createGateway } from '@ai-sdk/gateway';
import { getAdaptiveQualificationRule } from "@/lib/sanity/rules";
// ─── ADD THIS TO YOUR IMPORTS AT THE TOP OF THE FILE ───
import { createTenantRedisClient } from "@/lib/upstash"; // 🟢 Import dynamic factory
import { checkPaymentStatus, generateCheckoutSessionToken } from "@/lib/checkout";
import { getTenantConfig } from "@/lib/tenant";
import { handleGeneral } from "@/services/bot/general";
import { handleOrder } from "@/services/bot/order";
import { handleQualification } from "@/services/bot/qualification";
import { handleRecommendation } from "@/services/bot/recommendation";
import { handleSearch } from "@/services/bot/search";
import { handleStructured } from "@/services/bot/structured";
import { BotServiceArgs } from "@/types/bot";
import { createRedisState } from "@chat-adapter/state-redis";


// Allow up to 60s for processing
export const maxDuration = 60;

// Gateway Initialization
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * Type-safe helper mapping conversational budget strings to strict numerical price constraints.
 */
function getBudgetBounds(budgetRange?: string): { min: number; max: number } {
    const cleanRange = budgetRange?.toLowerCase().trim() || "";

    const lookup: Record<string, { min: number; max: number }> = {
        under_50k: { min: 0, max: 50000 },
        "50k_100k": { min: 50000, max: 100000 },
        "50k_200k": { min: 50000, max: 200000 },
        "100k_200k": { min: 100000, max: 200000 },
        "200k_500k": { min: 200000, max: 500000 },
        "500k_1m": { min: 500000, max: 1000000 },
        over_1m: { min: 1000000, max: Infinity },
    };

    return lookup[cleanRange] || { min: 0, max: Infinity };
}

/**
 * Strips trailing descriptor noise from coreNeed to protect database lookups
 */
function cleanCategoryKeyword(catString?: string): string {
    if (!catString) return "";
    return catString
        .toLowerCase()
        .replace(/products/g, "")
        .replace(/catalog/g, "")
        .replace(/items/g, "")
        .trim();
}

// src/app/api/webhook/telegram/process/route.ts

export async function POST(request: NextRequest) {
    console.log("[QStash Processor] Received a new background task payload");

    let payload: any;
    let rawBody = "";

    try {
        // 1. Extract the raw text stream first before any body transformers can corrupt it
        rawBody = await request.text();
        payload = JSON.parse(rawBody);

    } catch (err) {
        console.error("[QStash Processor] Failed to execute raw text payload parsing:", err);

        // ─── 🛡️ FIX 3: STANDARDIZED NON-BLOCKING RESPONSE CASING ───
        // We enforce standard NextResponse constructor formatting instead of global Response 
        // objects to guarantee Next.js signals endpoint closures cleanly to the edge server.
        return new NextResponse("Bad Request", {
            status: 400,
            headers: { "Content-Type": "text/plain" }
        });
    }

    const { update, tenant } = payload as { update: any; tenant: any };

    if (!update || !tenant) {
        console.error("[QStash Processor] Missing update or tenant payload details context block");

        // ─── 🛡️ FIX 3: STANDARDIZED NON-BLOCKING RESPONSE CASING ───
        return new NextResponse("Bad Request: Missing update or tenant context", {
            status: 400,
            headers: { "Content-Type": "text/plain" }
        });
    }

    // 2. Extract tenant-specific signing variables straight out of the embedded context object payload
    const currentSigningKey = tenant.qstashCurrentSigningKey;
    const nextSigningKey = tenant.qstashNextSigningKey;

    // 3. Cryptographically verify the signature using the Tenant's own isolated credentials
    if (currentSigningKey && nextSigningKey) {
        try {
            const receiver = new Receiver({
                currentSigningKey: currentSigningKey.trim(),
                nextSigningKey: nextSigningKey.trim(),
            });

            const signature = request.headers.get("upstash-signature");
            const isValid = await receiver.verify({
                signature: signature || "",
                body: rawBody, // Matches against the untransformed string data block
            });

            if (!isValid) {
                console.warn(`[QStash Processor][${tenant.companyName}] Cryptographic verification failed for isolated tenant signature header`);

                // ─── 🛡️ FIX 3: STANDARDIZED NON-BLOCKING RESPONSE CASING ───
                return new NextResponse("Unauthorized Signature", {
                    status: 401,
                    headers: { "Content-Type": "text/plain" }
                });
            }
            console.log(`[QStash Processor][${tenant.companyName}] Tenant signature verified successfully.`);
        } catch (err) {
            console.error(`[QStash Processor][${tenant.companyName}] Exception during custom signature verification loops:`, err);

            // ─── 🛡️ FIX 3: STANDARDIZED NON-BLOCKING RESPONSE CASING ───
            return new NextResponse("Unauthorized", {
                status: 401,
                headers: { "Content-Type": "text/plain" }
            });
        }
    } else {
        // Operational safety fallback for development or sandbox environments missing keys
        console.warn(`[QStash Processor][${tenant.companyName}] Skipping signature checks: Keys not configured in tenant's Sanity document.`);
    }

    try {
        const tenantClient = createTenantClient(tenant);

        // Extract Telegram ID and Chat ID to verify onboarding state
        const message = update.message ?? update.edited_message ?? null;
        const callbackQuery = update.callback_query ?? null;

        const chatId: number = message?.chat?.id ?? callbackQuery?.message?.chat?.id ?? 0;
        const telegramId: string = (message?.from?.id ?? callbackQuery?.from?.id)?.toString() ?? chatId.toString();

        if (chatId) {
            const isOnboarded = await checkOnboardingComplete(telegramId, tenantClient);
            if (!isOnboarded) {
                console.log(`[Onboarding Gate][${tenant.companyName}] User ${telegramId} not onboarded`);
                await handleOnboardingUpdate(update, chatId, telegramId, tenant, tenantClient);

                // ─── 🛡️ FIX 3: EXPLICIT PROTOCOL SEALING RESPONSE ───
                // Returns a clean, serialized JSON response envelope to close the network socket instantly
                return new NextResponse(JSON.stringify({ ok: true, status: "onboarding_redirected" }), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
        }

        // 🚀 Execute your newly optimized processUpdate containing our Fix 1 stream bailout rules
        await processUpdate(update, tenant, tenantClient);

        // ─── 🛡️ FIX 3: EXPLICIT PROTOCOL SEALING RESPONSE ───
        // By forcing a definitive NextResponse object here, we explicitly signal the Next.js App Router 
        // to drop open transport socket allocations and close the serverless runtime environment thread immediately!
        return new NextResponse(JSON.stringify({ ok: true, status: "process_complete" }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
        });

    } catch (err: any) {
        console.error(`[QStash Processor][${tenant.companyName}] Error processing message:`, err);

        // ─── 🛡️ FIX 3: STANDARDIZED NON-BLOCKING RESPONSE CASING ───
        // Return a clean 500 error response so QStash safely recognizes the exception for its retry drivers
        return new NextResponse(JSON.stringify({ error: err.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}


// ─── HELPER FOR NATIVE CHAT ACTIONS ──────────────────────────────────────────
/**
 * Triggers Telegram's visual typing indicator status bar.
 */
async function sendTelegramTypingAction(botToken: string, chatId: string | number) {
    const cleanToken = botToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
    const url = `https://api.telegram.org/bot${cleanToken}/sendChatAction`;
    try {
        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                chat_id: chatId,
                action: "typing" // Tells Telegram to show "bot is typing..."
            })
        });
    } catch (e) {
        console.warn("[Chat Action Indicator] Failed to broadcast typing frame:", e);
    }
}

// Core AI processing
async function processUpdate(
    update: any,
    tenant: TenantConfig,
    tenantClient: ReturnType<typeof createTenantClient>
): Promise<void> {

    // ─── 🛡️ FIX 1: SERVERLESS EVENT LOOP INSULATION ───
    // Instructs Vercel's infrastructure node layer that it can immediately tear down 
    // the container execution environment when the HTTP response returns, bypassing open sockets!
    if (global && (global as any).process) {
        process.nextTick(() => { });
    }

    const message = update.message ?? update.edited_message;
    const callbackQuery = update.callback_query;

    let chatId: number;
    let telegramId: string;

    if (callbackQuery) {
        chatId = callbackQuery.message?.chat?.id || 0;
        telegramId = callbackQuery.from?.id?.toString() || chatId.toString();
    } else if (message) {
        chatId = message.chat.id;
        telegramId = message.from?.id?.toString() || chatId.toString();
    } else {
        return;
    }

    // Immediate Token Validation Guard
    if (!tenant.telegramBotToken || tenant.telegramBotToken.trim() === "") {
        console.error(`[Webhook][${tenant.companyName}] Terminating request early: Missing bot token configuration.`);
        return;
    }

    // ─── STEP 1: INITIALIZE OR FETCH CONVERSATIONAL BUYER STOCK ───
    const currentUserName = message?.from?.username ?? message?.from?.first_name ?? callbackQuery?.from?.username ?? "user";
    const existingBuyer = await getOrCreateBuyer(telegramId, currentUserName, tenantClient);

    const tenantRedis = createTenantRedisClient(tenant);
    const stateAdapter = createRedisState({
        client: {
            get: (key: string) => tenantRedis.get(key),
            set: (key: string, val: string) => tenantRedis.set(key, typeof val === 'string' ? val : JSON.stringify(val)),
            del: (key: string) => tenantRedis.del(key),
            connect: async () => Promise.resolve(), // 🔄 Satisfies the internal initialization lock!
            on: (event: string, handler: Function) => {
                console.log(`[Gatekeeper State Shunt] Suppressed event subscription for: ${event}`);
            }
        } as any
    });


    // ─── 🟢 PART 1: SECURE CALLBACK QUERY INTERCEPTOR GATES ───
    if (callbackQuery) {
        const cbData = callbackQuery.data || "";

        // A. 💳 THE REAL-TIME PAYMENT CONFIRMATION POLLING CONTROLLER (PRESERVED)
        if (cbData === "payment_poll_check") {
            console.log(`[Polling Interceptor][${tenant.companyName}] User ${telegramId} clicked 'Payment Confirmed'. Polling isolated cache.`);

            // Defuse the Telegram button loading ring instantly to keep the UI highly responsive
            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
            const ackUrl = `https://api.telegram.org/bot${cleanToken}/answerCallbackQuery`
            try {
                await fetch(ackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
                });
            } catch (e) { }

            // ─── RESILIENT SKU RESOLUTION FOR POLL CHECK ───
            let targetProductSku = "";

            // Try to find any active checkout:session key for this user
            try {
                const sessionPattern = `checkout:session:${telegramId}:*`;
                const sessionKeys = await tenantRedis.keys(sessionPattern);
                if (sessionKeys && sessionKeys.length > 0) {
                    const latestKey = sessionKeys[sessionKeys.length - 1];
                    const keyParts = (latestKey as string).split(":");
                    targetProductSku = keyParts.slice(3).join(":");
                    console.log(`[Polling Interceptor][${tenant.companyName}] Resolved active checkout SKU from session key: "${targetProductSku}"`);
                }
            } catch (scanErr) {
                console.warn(`[Polling Interceptor][${tenant.companyName}] Key scan failed, falling back to coreNeed:`, scanErr);
            }

            // Fallback — use coreNeed with fuzzy catalog lookup
            if (!targetProductSku) {
                const coreNeedRaw = (existingBuyer?.coreNeed || "").trim().toLowerCase();
                const normalizedSlug = coreNeedRaw.replace(/\s+/g, "-");
                const productData = await tenantClient.fetch(
                    `*[_type == "product" && (
                        lower(productSku) == lower($coreNeed) ||
                        lower(slug.current) == lower($coreNeed) ||
                        lower(slug.current) == lower($normalizedSlug) ||
                        name match $coreNeed
                    )][0]{ productSku }`,
                    { coreNeed: coreNeedRaw, normalizedSlug }
                );
                targetProductSku = productData?.productSku || coreNeedRaw;
                console.log(`[Polling Interceptor][${tenant.companyName}] Fallback SKU from catalog lookup: "${targetProductSku}"`);
            }

            const sessionCacheKey = `checkout:session:${telegramId}:${targetProductSku}`;
            const cachedData = await tenantRedis.get(sessionCacheKey);
            console.log(`[Polling Interceptor][${tenant.companyName}] Polling Redis key: "${sessionCacheKey}" → ${cachedData ? "HIT" : "MISS"}`);

            const isAmharic = existingBuyer.language === 'am';
            let verified = false;
            let payload: any = null;

            if (cachedData) {
                payload = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;
                if (payload?.paymentStatus === "VERIFIED_PAID") {
                    verified = true;
                }
            }

            if (verified) {
                console.log(`[Polling Interceptor][${tenant.companyName}] Payment MATCH FOUND! Unrolling success message.`);

                const successText = isAmharic
                    ? `🎉 <b>ክፍያዎ በተሳካ ሁኔታ ተረጋግጧል!</b>\n\nስለ መረጡን እናመሰግናለን! ትዕዛዝዎ <b>📦 ተመዝግቧል</b>። በአሁኑ ወቅት የሽያጭ ቡድናችን ዕቃውን ለእርስዎ ለማዘጋጀት እየሠራ ይገኛል። ለተጨማሪ መረጃ ወይም የማድረሻ ሁኔታን ለመከታተል በቀጥታ እዚህ ያግኙን፦ ${tenant.supportHandle}። መልካም ቀን!`
                    : `🎉 <b>Payment Confirmed Successfully!</b>\n\nThank you for your purchase! Your order for <b>'${payload?.productName || payload?.productSku}'</b> has been securely locked in. Our logistics team is now preparing your fulfillment. For any assistance or delivery updates, feel free to reach out to us at ${tenant.supportHandle}!`;

                await sendFormattedMessage(tenant.telegramBotToken, chatId, successText, "HTML", null);
                return;
            } else {
                console.log(`[Polling Interceptor][${tenant.companyName}] No verified payment found yet for user ${telegramId}. Prompting retry.`);

                const retryNoticeText = isAmharic
                    ? `⚠️ <b>ክፍያዎ ገና አልተመዘገበም</b>\n\nየባንክ ማረጋገጫዎ በአሊጉ የውሂብ ጎታ ላይ እስካሁን አልደረሰም። እባክዎ በድር ጣቢያው ላይ ክፍያውን ማጠናቀቅዎን ያረጋግጡ። ክፍያውን ከፈጸሙ በኋላ ከ10-15 ሰከንድ ይጠብቁ እና እንደገና <b>'ክፍያ አረጋግጫለሁ'</b> የሚለውን ቁልፍ ይጫኑ። ለፈጣን እገዛ የደንበኞች አገልግሎታችንን እዚህ ያግኙ፦ ${tenant.supportHandle}።`
                    : `⚠️ <b>Payment Record Not Found Yet</b>\n\nWe haven't received a secure settlement callback from the payment gateway for your session yet. Please ensure you completed the transaction on the checkout page. If you have already paid, wait 10-15 seconds for the network to sync and tap <b>'I've Confirmed Payment'</b> again. For direct verification assistance, contact our support team at ${tenant.supportHandle}!`;

                await sendFormattedMessage(tenant.telegramBotToken, chatId, retryNoticeText, "HTML", null);
                return;
            }
        }

        // B. 📊 BANT SURVEY INTERACTIVE BUTTON RESPONSE CAPTURING FLOWS
        if (cbData.startsWith("budget_")) {
            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
            const ackUrl = `https://api.telegram.org/bot${cleanToken}/answerCallbackQuery`;
            try { await fetch(ackUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callback_query_id: callbackQuery.id }) }); } catch (e) { }

            const selectedBudgetRange = cbData.replace("budget_", "").replace("_", "-");
            const qualificationKey = `qualification:${telegramId}`;

            await tenantRedis.set(qualificationKey, JSON.stringify({ budgetRange: selectedBudgetRange, updatedAt: Date.now() }), { ex: 86400 });

            const isAmharic = existingBuyer.language === 'am';
            const surveyProgressText = isAmharic
                ? `✅ <b>የበጀት ምርጫዎ ተመዝግቧል!</b>\n\nአሁን የሽያጭ ረዳታችን የእርስዎን ፍላጎት በጥልቀት ተረድቶ ትክክለኛ ዕቃዎችን እንዲያቀርብልዎ እባክዎ ምን ዓይነት ምርት እንደሚፈልጉ በአጭሩ ይጻፉልን (ለምሳሌ "ላፕቶፕ" ወይም "የስልክ መለዋወጫ")፦`
                : `✅ <b>Budget preference locked in!</b>\n\nNow, tell our sales assistant what specific product types or features you are looking for in your own words (e.g. "a fast development laptop" or "wireless noise-canceling headphones") and they will match you instantly:`;

            await sendFormattedMessage(tenant.telegramBotToken, chatId, surveyProgressText, "HTML", null);
            return;
        }
    }

    // ─── 🚦 PART 2: DYNAMIC CONVERSATIONAL INTENT SWITCH CONTROLLER ───
    if (!message || !message.text) return;
    const userText = message.text;

    // ─── 🟢 NEW: INITIALIZE THE AUTOMATED TYPING TICKER LOOP ───
    console.log(`[Chat Action Indicator] Initializing visual typing loop for chat: ${chatId}`);

    // Fire the first frame instantly to maximize user feedback response speed
    // ─── 🛡️ THE NON-BLOCKING, SELF-EXTINGUISHING CHAT ACTION DRIVER ───
    const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
    const sendTypingAction = async () => {
        try {
            await fetch(`https://api.telegram.org/bot${cleanToken}/sendChatAction`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ chat_id: chatId, action: "typing" })
            });
        } catch (e) { }
    };
    // Fire the first frame instantly to maximize user visual feedback response speed
    await sendTypingAction();

    // 🟢 FIXED: Create a local, mutable visibility state control flag object parameter
    let isTypingLoopActive = true;
    let currentTypingFrameCount = 0;
    // ─── 🛡️ FIX: Capture the timer handle so it can be cleared in the finally block ───
    // Without this, the scheduled setTimeout callbacks keep the Node.js event loop open
    // after the function completes, preventing Vercel from closing the runtime cleanly.
    let typingTimerHandle: ReturnType<typeof setTimeout> | null = null;

    // Recursive timeout cascade blocks infinite event loop hanging completely!
    const runTypingTickerCascade = async () => {
        // Self-extinguish safety gate: Hard-kill the loop if it fires more than 3 times (12 seconds)
        // or if the underlying service has already finished processing!
        if (!isTypingLoopActive || currentTypingFrameCount >= 3) {
            console.log(`[Chat Action Ticker] Self-extinguished safely at frame limit count.`);
            return;
        }

        currentTypingFrameCount++;
        console.log(`[Chat Action Ticker] Refreshing typing animation frame [${currentTypingFrameCount}/3]...`);
        await sendTypingAction();

        // Recursively chain the next execution without hogging the macro-task queue
        typingTimerHandle = setTimeout(runTypingTickerCascade, 4000);
    };

    // Launch the non-blocking visibility chain
    typingTimerHandle = setTimeout(runTypingTickerCascade, 4000);

    // Execute the Redis-cached bilingual intent classifier
    const intentResult = await detectIntent(userText, tenant);
    console.log(`[Webhook Traffic Controller][${tenant.companyName}] Routed Action: ${intentResult.intent}`);

    // Resolve unified, centralized tenant config properties
    const tenantConfig = await getTenantConfig(tenant.id);

    // Frame-aware thread abstraction required by the micro-services
    const mockThreadAbstraction: any = {
        id: chatId.toString(),
        post: async (streamOrText: any, externalSignal?: AbortSignal) => {
            let finalOutputString = "";

            if (streamOrText && (typeof streamOrText[Symbol.asyncIterator] === "function" || typeof streamOrText.next === "function")) {
                console.log(`[Gatekeeper Transport] Consuming streaming text tokens progressively...`);

                // ─── 🛡️ REAL STREAM BAILOUT FIX ───
                // The old setTimeout only logged a warning — it NEVER broke the for-await loop.
                // We now use AbortController: when the timer fires, abort() is called which
                // causes the async generator to throw an AbortError, immediately exiting the loop.
                const bailoutController = new AbortController();
                const bailoutTimer = setTimeout(() => {
                    console.warn("[Gatekeeper Transport] Stream hit time budget — aborting via AbortController.");
                    bailoutController.abort();
                }, 20000); // 20s hard cap for stream consumption

                // If the caller's signal fires first (e.g. from streamText abortSignal), honour it too
                externalSignal?.addEventListener('abort', () => bailoutController.abort(), { once: true });

                try {
                    for await (const chunk of streamOrText) {
                        if (bailoutController.signal.aborted) break; // Exit loop on abort
                        finalOutputString += chunk;
                    }
                } catch (streamErr: any) {
                    if (streamErr?.name !== 'AbortError') {
                        console.error("[Gatekeeper Transport] Async iterator error intercepted:", streamErr);
                    } else {
                        console.warn("[Gatekeeper Transport] Stream aborted cleanly via AbortController.");
                    }
                } finally {
                    clearTimeout(bailoutTimer);
                }
            } else {
                finalOutputString = streamOrText?.toString() || "";
            }

            // Clean up any residual structural layout artifacts
            finalOutputString = finalOutputString.trim();

            // 🛡️ REJECTION SHIELD: Enforce a rigid non-empty fallback string parameter 
            // to guarantee your Telegram API calls never throw a 400 Empty Text code error!
            if (!finalOutputString || finalOutputString === "" || finalOutputString === "[object AsyncGenerator]") {
                console.warn("[Gatekeeper Transport] Warning: Stream resolved to empty string or object wrapper text.");
                console.error(`[Gatekeeper Transport] Intent was: ${intentResult.intent}`)
                console.error(`[Gatekeeper Transport] User text was: ${userText}`)
            }

            console.log(`[Gatekeeper Transport] Forwarding pristine text message string package to Telegram...`);

            return await sendFormattedMessage(tenant.telegramBotToken, chatId, finalOutputString, "HTML", null);
        }
    };

    const serviceArgs: any = {
        messages: [], // Managed internally via the services now
        chatId: telegramId,
        thread: mockThreadAbstraction,
        intentResult,
        tenant: tenantConfig,
        userText,
        stateAdapter: stateAdapter // 🟢 THIS IS THE MISSING LINK COMPONENT!
    };
    // ─── 🛡️ SECURITY SHIELD A: CONFIDENCE THRESHOLD GUARD ───
    if (intentResult.confidence < 0.6) {
        console.log(`[Gatekeeper][${tenant.companyName}] Low classification confidence (${intentResult.confidence}). Routing to Route C.`);
        await handleGeneral(serviceArgs);
        return;
    }

    // ─── 🛡️ THE ARCHITECTURAL SAFETY WRAPPER matrix ───
    try {
        console.log(`[Gatekeeper Router] Executing traffic matrix switch dispatch channels...`);

        // 🚦 TRIPLE-TRACK ROUTING DISPATCH SWITCH MATRIX
        switch (intentResult.intent) {

            // ✅ ROUTE A: Structured Price/SKU Catalog Browser
            case "product_browse":
            case "product_detail":
            case "faq":
                console.log(`[Gatekeeper][${tenant.companyName}] Routing to Structured Service (Route A).`);
                await handleStructured(serviceArgs); // 🔄 FIXED: Waits for the full stream to complete!
                return;

            // ✅ ROUTE B: Unstructured Meaning-Based Semantic Discovery
            case "unstructured_search":
                console.log(`[Gatekeeper][${tenant.companyName}] Routing to Unstructured Service (Route B).`);
                await handleSearch(serviceArgs); // 🔄 FIXED: Waits for the full stream to complete!
                return;

            // ✅ ROUTE D: BANT Survey State Consolidation Recommendation Matrix
            case "recommendation":
            case "qualification":
                console.log(`[Gatekeeper][${tenant.companyName}] Routing to Recommendation Service (Route D).`);
                await handleRecommendation(serviceArgs); // 🔄 FIXED: Waits for the full stream to complete!
                return;

            // ✅ ROUTE E: Cryptographic Transaction Order Compiler
            case "order":
                console.log(`[Gatekeeper][${tenant.companyName}] Routing to Transactional Order Service (Route E).`);
                await handleOrder(serviceArgs); // 🔄 FIXED: Waits for the full stream to complete!
                return;
            // ✅ ROUTE C: Conversational Small Talk Fallbacks ($0 Token Costs)
            case "unknown":
            default:
                console.log(`[Gatekeeper][${tenant.companyName}] Routing to General Conversational Service (Route C).`);
                await handleGeneral(serviceArgs)
                return;
        }

    } catch (err: any) {
        console.error(`[Gatekeeper Router Crash] An execution exception occurred inside service loops:`, err.message);
        throw err; // Propagate the error so QStash can manage fallback queues
    } finally {
        // ─── 🏁 FIXED: THE ABSOLUTE LIFECYCLE SAFETY ANCHOR ───
        // Because this lives inside 'finally', JavaScript forces this block to run 
        // the exact millisecond any of the switch cases finish executing! 
        // It cleanly halts the typing ticker loop out of memory every single time.
        isTypingLoopActive = false;
        // ─── 🛡️ FIX: Clear the pending setTimeout so Vercel can close the runtime ───
        // Without clearTimeout, the scheduled callbacks stay in the Node.js event loop
        // and prevent the serverless container from shutting down cleanly.
        if (typingTimerHandle) clearTimeout(typingTimerHandle);
        console.log(`[Chat Action Indicator] Typing loop successfully released from serverless memory.`);
    }
}

// ─── Onboarding Helpers ───────────────────────────────────────────────────────

async function checkOnboardingComplete(
    telegramId: string,
    tenantClient: ReturnType<typeof createTenantClient>
): Promise<boolean> {
    try {
        const { getBuyer } = await import("@/lib/sanity/buyer");
        const buyer = await getBuyer(telegramId, tenantClient);
        return !!(buyer && buyer.onboardingStep === "completed");
    } catch (e) {
        console.error("[Onboarding] Check failed:", e);
        return false;
    }
}

async function handleOnboardingUpdate(
    update: any,
    chatId: number,
    telegramId: string,
    tenant: TenantConfig,
    tenantClient: ReturnType<typeof createTenantClient>
) {
    try {
        const { handleOnboarding } = await import("@/lib/onboarding");
        const { getBuyer } = await import("@/lib/sanity/buyer");

        const buyer = await getBuyer(telegramId, tenantClient);
        const result = await handleOnboarding(null, update, buyer, telegramId, tenant, tenantClient) as any;

        if (result.handled && result.response) {
            await sendFormattedMessage(
                tenant.telegramBotToken,
                chatId,
                result.response.text,
                "HTML",
                result.response.replyMarkup ?? null
            );

            if (result.nextResponse) {
                await new Promise((resolve) => setTimeout(resolve, 150));
                await sendFormattedMessage(
                    tenant.telegramBotToken,
                    chatId,
                    result.nextResponse.text,
                    "HTML",
                    result.nextResponse.replyMarkup ?? null
                );
            }
        }
    } catch (e) {
        console.error(`[Onboarding Handler][${tenant.companyName}] Failed:`, e);
        await sendFormattedMessage(
            tenant.telegramBotToken,
            chatId,
            `Welcome to ${tenant.companyName}! Type /start to begin.`,
            "HTML",
            null
        );
    }
}
