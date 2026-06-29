// src/app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateText } from "ai";
import { adminClient, createTenantClient } from "@/sanity/client";
import { detectIntent, IntentResult, IntentType } from "@/lib/ai/intent";
import {
    buildSystemPrompt,
    buildInfoPrompt,
    buildSalesPrompt,
    buildSupportPrompt,
    buildGreetingPrompt,
    buildFallbackPrompt,
    buildRecommendationPrompt,
} from "@/lib/ai/prompts";
import { buildSanityTools } from "@/lib/ai/tools";
import { sendFormattedMessage } from "@/lib/telegram/format";
import { getProductList, getProductDetails, getFAQs, getProductRecommendations } from "@/lib/sanity/queries";
import type { TenantContext } from "@/types/tenant";
import { createOrUpdateBuyer, getBuyer, getOrCreateBuyer, updateBuyerProfile } from "@/lib/sanity/buyer";
import { any } from "zod";
import { google } from "@ai-sdk/google";
import { calculateDynamicLeadStatus, getMissingParameterKeyboard, processQualification } from "@/lib/qualification";
import { createGateway } from '@ai-sdk/gateway';
import { getAdaptiveQualificationRule } from "@/lib/sanity/rules";

// ─── Gateway Initialization ───────────────────────────────────────────────
// Use the GOOGLE_API_KEY from your environment variables.
// We explicitly set autoTokenFetching to true so you don't need to manage keys.
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});


// Allow up to 60s for AI to respond
export const maxDuration = 60;

// ─── Tenant Resolution Cache (Option B: Secret-Header Lookup with cache) ───────
// Keyed by telegramWebhookSecret. TTL = 5 minutes.
const TENANT_CACHE_TTL = 5 * 60 * 1000;
const tenantBySecretCache = new Map<string, { tenant: TenantContext; expires: number }>();

async function resolveTenantBySecret(secret: string): Promise<TenantContext | null> {
    // 1. Check cache first
    const cached = tenantBySecretCache.get(secret);
    if (cached && Date.now() < cached.expires) {
        return cached.tenant;
    }

    // 2. Query admin project for the matching tenant
    try {
        const tenant = await adminClient.fetch<TenantContext | null>(
            `*[_type == "tenant" && telegramWebhookSecret == $secret && status in ["active", "trial"]][0]{
                "id": _id,
                companyName,
                "subdomain": subdomain.current,
                niche,
                supportHandle,
                systemPrompt,
                conversionGoalDescription,
                telegramBotToken,
                telegramWebhookSecret,
                projectId,
                dataset,
                sanityApiToken,
                dailyMessageLimit,
                status
            }`,
            { secret }
        );

        if (tenant) {
            tenantBySecretCache.set(secret, { tenant, expires: Date.now() + TENANT_CACHE_TTL });
        }
        return tenant ?? null;
    } catch (e) {
        console.error("[Webhook] Tenant resolution failed:", e);
        return null;
    }
}

// ─── Webhook handler ───────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    console.log("[Webhook] Received a new request");

    // 1. Extract and validate the Telegram secret header
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (!secretHeader) {
        console.warn("[Webhook] Missing secret token header — rejecting");
        return new Response("Unauthorized", { status: 401 });
    }

    // 2. Resolve tenant from the secret (with cache)
    const tenant = await resolveTenantBySecret(secretHeader);
    if (!tenant) {
        console.warn("[Webhook] No active tenant found for provided secret — rejecting");
        return new Response("Unauthorized", { status: 401 });
    }

    console.log(`[Webhook][${tenant.companyName}] Tenant resolved`);

    // 3. Parse body
    let update: any;
    try {
        update = await request.json();
    } catch {
        console.error(`[Webhook][${tenant.companyName}] Failed to parse request body`);
        return new Response("Bad Request", { status: 400 });
    }

    // 4. Determine update type
    const message = update.message ?? update.edited_message ?? null;
    const callbackQuery = update.callback_query ?? null;

    if (!message && !callbackQuery) {
        return new Response("OK", { status: 200 });
    }

    // Extract chatId and telegramId
    const chatId: number =
        message?.chat?.id ?? callbackQuery?.message?.chat?.id ?? 0;
    const telegramId: string =
        (message?.from?.id ?? callbackQuery?.from?.id)?.toString() ??
        chatId.toString();

    if (!chatId) {
        console.warn(`[Webhook][${tenant.companyName}] Could not determine chatId, skipping.`);
        return new Response("OK", { status: 200 });
    }

    // 5. Build the tenant Sanity client once per request
    const tenantClient = createTenantClient(tenant);

    // 6. Onboarding gate
    const isOnboarded = await checkOnboardingComplete(telegramId, tenantClient);

    if (!isOnboarded) {
        console.log(`[Onboarding Gate][${tenant.companyName}] User ${telegramId} not onboarded`);
        await handleOnboardingUpdate(update, chatId, telegramId, tenant, tenantClient);
        return new Response("OK", { status: 200 });
    }

    // 7. Fully onboarded — run AI flow asynchronously
    console.log(`[Bot][${tenant.companyName}] User ${telegramId} is onboarded → Running AI flow`);
    waitUntil(
        processUpdate(update, tenant, tenantClient).catch((err: any) => {
            console.error(`[Bot][${tenant.companyName}] Unhandled error:`, err?.message ?? err);
        })
    );

    return new Response("OK", { status: 200 });
}
/**
 * Type-safe helper mapping conversational budget strings to strict numerical price constraints.
 * Resolves implicit 'any' indexing compilation errors.
 */
/**
 * Type-safe helper mapping conversational budget strings to strict numerical price constraints.
 */
function getBudgetBounds(budgetRange?: string): { min: number; max: number } {
    const cleanRange = budgetRange?.toLowerCase().trim() || "";

    // Explicit dictionary type mapping matching your exact Sanity configuration formats
    const lookup: Record<string, { min: number; max: number }> = {
        under_50k: { min: 0, max: 50000 },
        "50k_100k": { min: 50000, max: 100000 },
        "50k_200k": { min: 50000, max: 200000 }, // Added missing 50k_200k bounds explicitly
        "100k_200k": { min: 100000, max: 200000 },
        "200k_500k": { min: 200000, max: 500000 },
        "500k_1m": { min: 500000, max: 1000000 },
        over_1m: { min: 1000000, max: Infinity },
    };

    return lookup[cleanRange] || { min: 0, max: Infinity };
}

/**
 * 🟢 NEW HELPER: Strips trailing descriptor noise from coreNeed to protect database lookups
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


// ─── Core AI processing ────────────────────────────────────────────────────────
async function processUpdate(
    update: any,
    tenant: TenantContext,
    tenantClient: ReturnType<typeof createTenantClient>
): Promise<void> {
    const message = update.message ?? update.edited_message;
    const callbackQuery = update.callback_query;

    let chatId: number;
    let telegramId: string;
    let activeBuyerProfile: any = null; // 🟢 FIX: Declared globally at the top of the scope block

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
    // ─── 🟢 IN-MEMORY OVERRIDE POINTERS & CALLBACK FLAG ───
    // isQualificationCallback = true means a budget_/timeline_ button was clicked.
    // When true we skip processQualification entirely — the shadow AI has no signal
    // from the simulated "recommendation" text and would only erase saved data.
    let forcedBudgetOverride: string | undefined = undefined;
    let forcedTimelineOverride: string | undefined = undefined;
    let isQualificationCallback = false;

    // Handle Callback Queries for Qualification
    // ─── 1. FIXED CALLBACK QUERY CONTROLLER (CONTINUOUS CHAINING LOOP) ───
    if (callbackQuery) {
        const cbData = callbackQuery.data || "";
        // 🟢 INTERCEPT THE INITIAL RECOMMENDATION CTA BUTTON SAFELY
        if (cbData === "recommend_init") {
            console.log(`[Recommendation Engine] User initiated a personalized finder journey.`);

            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
            const ackUrl = `https://telegram.org/bot${cleanToken}/answerCallbackQuery`;
            try {
                await fetch(ackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
                });
            } catch (e) { }

            // Pass execution straight down into the main loop handlers with a recommendation intent token
            update.message = { text: "recommendation", chat: { id: chatId }, from: callbackQuery.from };
        }

        if (cbData.startsWith("budget_") || cbData.startsWith("timeline_")) {
            console.log(`[Qualification Callback][${tenant.companyName}] Received Button Click: ${cbData}`);
            // 🛠 TRACE LOG 1: Capture the incoming raw button string details
            console.log(`[DIAGNOSTIC 1] Tapped Button Data Token: "${cbData}"`);

            const parts = cbData.split("_");
            const key = parts[0];
            const value = parts.slice(1).join("_");
            // ─── 🟢 SET OVERRIDE VALUES & MARK AS CALLBACK PATH ───
            if (key === "budget") forcedBudgetOverride = value;
            if (key === "timeline") forcedTimelineOverride = value;
            isQualificationCallback = true; // ← prevents processQualification from wiping these


            // 🛠 TRACE LOG 2: Verify the parsed keys and values match your schema models
            console.log(`[DIAGNOSTIC 2] Parsed Components -> Key: "${key}", Value: "${value}"`);

            const updatedFields = {
                budgetRange: key === "budget" ? value : undefined,
                timeline: key === "timeline" ? value : undefined,
                lastQualifiedAt: new Date().toISOString(),
            };

            // 1. Save button selection straight to Sanity
            await createOrUpdateBuyer(telegramId, updatedFields, tenantClient);
            console.log(`[DIAGNOSTIC 3] Sanity patch commit triggered successfully.`);
            const freshlyPatchedBuyer = await getOrCreateBuyer(telegramId, currentUserName, tenantClient);

            // Dynamically recalculate and update lead score stage states
            const statusMetrics = calculateDynamicLeadStatus(freshlyPatchedBuyer);
            await updateBuyerProfile(telegramId, tenantClient, {
                qualificationStage: statusMetrics.stage,
                leadScore: statusMetrics.score
            });
            // 🛠 TRACE LOG 4: Check if Sanity's returned cache object is holding the update or masking it
            console.log(`[DIAGNOSTIC 4] Sanity Fetch Result -> Cache Budget: "${freshlyPatchedBuyer.budgetRange}", Cache Timeline: "${freshlyPatchedBuyer.timeline}"`);

            // 3. Update the local context profile state so Step 4 evaluates fresh data fields instantly
            activeBuyerProfile = {
                ...freshlyPatchedBuyer,
                budgetRange: key === "budget" ? value : (freshlyPatchedBuyer.budgetRange || ""),
                timeline: key === "timeline" ? value : (freshlyPatchedBuyer.timeline || ""),
                qualificationStage: statusMetrics.stage,
                leadScore: statusMetrics.score
            };
            // 🛠 TRACE LOG 5: Absolute confirmation check of what Step 4 will see
            console.log(`[DIAGNOSTIC 5] Final Forced Variable State -> Budget to Step 4: "${activeBuyerProfile.budgetRange}", Timeline to Step 4: "${activeBuyerProfile.timeline}"`);

            // Clean, whitespace-stripped token extraction for safe endpoint construction
            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");

            // ✅ CORRECT FIXED API PATH CONCATENATION:
            const ackUrl = "https://api.telegram.org/bot" + cleanToken + "/answerCallbackQuery";

            try {
                await fetch(ackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
                });
                console.log("[Telegram] Callback query successfully acknowledged.");
            } catch (e) {
                console.warn("[Telegram] Callback acknowledgement failed to connect:", e);
            }
            // Shift pointers to cascade cleanly into the parser layers below
            // 1. 🔄 FIRST: Inject the mock simulated text token directly into the update context object wrapper
            const simulatedText = "recommendation";
            update.message = { text: simulatedText, chat: { id: chatId }, from: callbackQuery.from };

            // Execute the pipeline below smoothly by continuing execution
        }
    }
    // 2. 🔄 SECOND: Compute the active request pointer payload variable BEFORE testing text properties!
    const activeMessage = update.message ?? message;

    // 3. 🔄 THIRD: Run the text verification check against the computed active message pointer, NOT the legacy root reference!
    if (!activeMessage?.text) {
        console.log(`[Bot][${tenant.companyName}] No text in active request payload, skipping AI flow.`);
        return;
    }
    const userText: string = activeMessage.text;
    const userName: string = activeMessage.from?.username ?? activeMessage.from?.first_name ?? "user";

    console.log(`[Bot][${tenant.companyName}] Processing incoming string payload: "${userText}"`);


    // ─── 2. ⚡ HIGH-PERFORMANCE INTENT DE-DUPLICATION SHORTCUT BPASS ───
    let intentResult;

    // ✅ LOCAL DETERMINISTIC CHECK: If the request text matches our system tokens, 
    // bypass the Vercel AI Gateway completely, saving your RPM quota balance!
    if (userText === "recommendation") {
        console.log(`[Shortcut Router] Bypassing AI Intent Router for system recommendation token.`);
        intentResult = {
            intent: "recommendation" as const,
            confidence: 1.0,
            language: (activeBuyerProfile?.preferredLanguage || 'en') as 'am' | 'en',
            params: { category: activeBuyerProfile?.coreNeed || "" }
        };
    } else {
        // Run normal AI gateway evaluation only for free-form user statements
        try {
            intentResult = await detectIntent(userText, tenant);
        } catch (err) {
            console.error(`[Bot][${tenant.companyName}] Intent detection error:`, err);
            intentResult = { intent: "unknown" as const, confidence: 0, language: 'en' as const, params: undefined };
        }
    }


    const intent = intentResult.intent as string;
    const userLanguage = intentResult.language || 'en';

    // ─── 3. RUN ADAPTIVE QUALIFICATION PIPELINE (SHADOW AI) ───
    // ─── INSIDE STEP 3 IN route.ts ───
    if (userText !== "recommendation") {
        try {
            activeBuyerProfile = await processQualification(telegramId, intentResult, userText, tenantClient, tenant, existingBuyer);

            // 🟢 AUTO-POPULATE HOOK: If shadow extraction is blank but intent isolated a valid category,
            // we implicitly save it to clear profile gaps and fuel your recommendation tool parameters!
            if ((!activeBuyerProfile?.coreNeed || activeBuyerProfile.coreNeed === "") && intentResult.params?.category) {
                console.log(`[Data Engine] Auto-patching empty coreNeed with isolated intent category: ${intentResult.params.category}`);
                activeBuyerProfile = await updateBuyerProfile(telegramId, tenantClient, {
                    coreNeed: intentResult.params.category
                });
            }
        } catch (err) {
            console.error(`[Bot][${tenant.companyName}] Shadow parsing skipped:`, err);
        }
    } else {
        activeBuyerProfile = existingBuyer;
    }


    // ─── 4. HIGH-CONVERSION RECOMMENDATION INTERCEPTOR GATEWAYS ───
    if (intent === "recommendation" || intent === "qualification") {
        const currentCategory = intentResult.params?.category || activeBuyerProfile?.coreNeed || "";
        const adaptiveRule = await getAdaptiveQualificationRule(tenantClient, currentCategory, intent);

        let checkBudget = forcedBudgetOverride !== undefined ? forcedBudgetOverride : (activeBuyerProfile?.budgetRange || "");
        if (checkBudget === "trigger_recommendation") checkBudget = "";

        const effectiveBudget = checkBudget;
        const effectiveTimeline = forcedTimelineOverride !== undefined ? forcedTimelineOverride : (activeBuyerProfile?.timeline || "");

        console.log(`[DIAGNOSTIC 7] Interceptor Verification -> Budget: "${effectiveBudget}", Timeline: "${effectiveTimeline}"`);

        if (!effectiveBudget || effectiveBudget === "") {
            console.log(`[UX Interceptor] Budget criteria missing. Rendering budget panel.`);
            const kb = getMissingParameterKeyboard('budgetRange', userLanguage, adaptiveRule);
            await sendFormattedMessage(tenant.telegramBotToken, chatId, kb.text, "HTML", kb.replyMarkup);
            return;
        }

        if (!effectiveTimeline || effectiveTimeline === "") {
            console.log(`[UX Interceptor] Timeline criteria missing. Rendering timeline panel.`);
            const kb = getMissingParameterKeyboard('timeline', userLanguage, adaptiveRule);
            await sendFormattedMessage(tenant.telegramBotToken, chatId, kb.text, "HTML", kb.replyMarkup);
            return;
        }
    }

    // ─── 5. ASSEMBLING INTEGRATED PROMPT CONTEXT PAYLOAD ───
    let sanityContext = "";
    let prompt = "";
    let activeReplyMarkup: any = null;
    // 🔄 CONCURRENCY SAFEGUARD OVERRIDE: Update the active buyer profile properties 
    // in-memory using your local tracking metrics variables before compiling prompt states.
    // This entirely clears out any remote edge database transaction latency gaps.
    if (activeBuyerProfile) {
        activeBuyerProfile = {
            ...activeBuyerProfile,
            budgetRange: forcedBudgetOverride !== undefined ? forcedBudgetOverride : (activeBuyerProfile.budgetRange || ""),
            timeline: forcedTimelineOverride !== undefined ? forcedTimelineOverride : (activeBuyerProfile.timeline || "")
        };
    }

    const ctx = {
        userName,
        userMessage: userText,
        detectedIntent: intent,
        tenant,
        userLanguage,
        buyerProfile: activeBuyerProfile // Pass scores directly into prompt generation rules
    };
    // Initialize custom variable tracking slots for active reply markup buttons layer injection


    try {
        if (intent === "recommendation") {
            // 🔄 HIGH PERFORMANCE TOOL PRE-FEED: Since all data metrics are populated,
            // call your custom queries utility to feed the initial matching results directly into context tokens.

            const bounds = getBudgetBounds(activeBuyerProfile.budgetRange);
            // 🔄 FIXED PARAMETER HOOKS: Clean the category string before pulling matching context data
            // 🔄 FIXED: Extract the raw category parameter and strip out text noise like "products"
            const rawCat = intentResult.params?.category || activeBuyerProfile?.coreNeed || "";
            const targetCat = cleanCategoryKeyword(rawCat);
            console.log(`[Context Engine] Pre-fetching recommendations for Cat: "${targetCat}" between ${bounds.min} - ${bounds.max}`);
            const matches = await getProductRecommendations(tenantClient, targetCat, bounds.min, bounds.max);

            sanityContext = matches.length > 0 ? JSON.stringify(matches) : "No specific price-matched items found.";
            prompt = buildRecommendationPrompt({ ...ctx, sanityContext });

        }
        else if (intent === "product_browse") {
            const products = await getProductList(tenantClient, intentResult.params?.category);
            sanityContext = products.length > 0 ? JSON.stringify(products) : "No items found in this category.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
            // ─── 🟢 FIXED: GENERATE THE DYNAMIC CTA INTERACTIVE HOOK BUTTON INLINE LAYER ───
            activeReplyMarkup = {
                inline_keyboard: [
                    [
                        {
                            text: userLanguage === 'am' ? "🤖 ለእኔ የሚሆን ምርጫ አሳይ" : "🤖 Get Personalized Recommendation",
                            callback_data: "recommend_init" // Clicking maps natively onto your split interceptors
                        }
                    ]
                ]
            };

        } else if (intent === "product_detail") {
            let product = null;
            if (intentResult.params?.slug) {
                product = await getProductDetails(tenantClient, intentResult.params.slug);
            }
            sanityContext = product ? JSON.stringify(product) : "Item not found. Please check spelling.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
        } else if (intent === "faq") {
            const faqs = await getFAQs(tenantClient, intentResult.params?.faqCategory);
            sanityContext = faqs.length > 0 ? JSON.stringify(faqs) : "No FAQs found.";
            prompt = buildInfoPrompt({ ...ctx, sanityContext });
        } else if (intent === "order") {
            prompt = buildSupportPrompt({
                ...ctx,
                sanityContext: `Direct user to contact support at ${tenant.supportHandle} to complete their order.`,
            });
        } else if (intent === "greeting") {
            prompt = buildGreetingPrompt(ctx);
        } else {
            prompt = buildFallbackPrompt(ctx);
        }
    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] Static context retrieval failed:`, err);
        prompt = buildFallbackPrompt({ ...ctx, sanityContext: "Error retrieving database context catalog data." });
    }

    console.log(`[Bot][${tenant.companyName}] Calling Resilient AI Engine with language: [${userLanguage}]...`);

    let replyText = "";
    try {
        const tools = buildSanityTools(tenantClient, tenant);

        // Sharpen the instructions to force Gemini to translate data queries into target script
        // src/app/api/webhook/telegram/route.ts

        const languageConstraint = userLanguage === 'am'
            ? `\n\nCRITICAL BILINGUAL AND TOOL-EXECUTION POLICY:
- The user is interacting with you in Amharic. 
- You MUST provide your final response to the user entirely in clean, beautiful, natural Amharic script (ፊደል).
- When you execute catalog tools, you will receive product data (names, prices, descriptions) written in English from the database. 
- This is expected. Do not return empty text or raw JSON. 
- You must translate or transliterate the English product information into Amharic text dynamically for the user (e.g., if the tool returns product name: "Coffee Machine", write it as "የቡና ማሽን" or "ኮፊ ማሽን" in your final Amharic text list).
- Keep the numerical currency price accurate and append 'ETB' or 'ብር'.`
            : "\n\nCRITICAL LANGUAGE POLICY: The user is speaking English. Respond entirely in clear, friendly English.";

        const result = await generateText({
            model: gateway('google/gemini-2.5-flash'),
            system: `${buildSystemPrompt(tenant)}${languageConstraint}`, // Forces runtime language adherence
            prompt,
            tools,
            providerOptions: {
                google: {
                    useProduction: true, // This ensures v1 API, not v1beta
                },
                // Additionally, you can specify provider order
                gateway: {
                    order: ['google'], // Only use Google's production endpoint
                    models: ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-preview-09-2025'], // Fallback models
                },
                maxSteps: 5,
            } as any,

        });

        // Capture the output from the AI response
        replyText = result.text;

        // 🔄 FIXED: Instead of crashing your bot with a 'throw' error when text is empty,
        // we smoothly handle it by applying a native Amharic or English conversational fallback.
        if (!replyText || replyText.trim() === "") {
            console.warn(`[Bot][${tenant.companyName}] AI returned a blank response text string. Applying fallback message.`);

            replyText = userLanguage === 'am'
                ? `ይቅርታ፣ አሁን ላይ መረጃውን ማግኘት አልቻልኩም። እባክዎ ጥያቄዎን በሌላ አገላለጽ እንደገና ይሞክሩት ወይም እዚህ ያግኙን፡ ${tenant.supportHandle}`
                : `I couldn't retrieve that information right now. Please try rephrasing your request or reach out to us at ${tenant.supportHandle}.`;
        }

        // Clean out any raw internal system tags if they happen to look like code tokens
        if (replyText.includes("üllttool_code")) {
            replyText = replyText.replace(/üllttool_code/g, "");
        }

    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] AI multi-step execution failed completely:`, err);
        // Multilingual fallback resilience if the entire network or API completely drops
        replyText = userLanguage === 'am'
            ? `⚠️ ይቅርታ፣ መረጃውን ማግኘት አልቻልኩም። እባክዎ እንደገና ይሞክሩ ወይም እዚህ ያግኙን፡ ${tenant.supportHandle}።`
            : `⚠️ I'm sorry, I encountered an issue processing that. Please try again or contact support at ${tenant.supportHandle}.`;
    }

    console.log(`[Bot][${tenant.companyName}] AI finalized reply payload:`, replyText.slice(0, 100));
    console.log(`[Diagnostic][${tenant.companyName}] Target Channel Token: "EXISTS" | Length: ${tenant.telegramBotToken.length} | ChatId: ${chatId}`);

    // Clean token calculation right here for visibility
    const cleanTokenForLog = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
    const computedUrlTest = `https://api.telegram.org/bot${cleanTokenForLog}/sendMessage`;

    // 🛠 THIS WILL DEFINITELY PRINT IN YOUR VERCEL TERMINAL UNLESS THE APP CRASHED BEFORE THIS LINE
    console.log(`[CRITICAL DIAGNOSTIC][${tenant.companyName}] Full Target Outbound URL: ${computedUrlTest}`);
    console.log(`[CRITICAL DIAGNOSTIC][${tenant.companyName}] Sending to ChatId: ${chatId} | Message length: ${replyText.length}`);

    try {
        // Dispatched exclusively with HTML parse modes
        await sendFormattedMessage(tenant.telegramBotToken, chatId, replyText, "HTML", activeReplyMarkup);
        console.log(`[Bot][${tenant.companyName}] Reply sent successfully to Telegram endpoints.`);
    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] Fatal transport exception:`, err);
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
    tenant: TenantContext,
    tenantClient: ReturnType<typeof createTenantClient>
) {
    try {
        const { handleOnboarding } = await import("@/lib/onboarding");
        const { getBuyer } = await import("@/lib/sanity/buyer");

        // ✅ Directly fetches the singular buyer object dictionary without type confusion
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
    }
}
