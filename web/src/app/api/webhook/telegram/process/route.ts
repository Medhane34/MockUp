// src/app/api/webhook/telegram/process/route.ts
import { NextRequest } from "next/server";
import { generateText } from "ai";
import { createTenantClient } from "@/sanity/client";
import { detectIntent, IntentResult, IntentType } from "@/lib/ai/intent";
import { Receiver } from "@upstash/qstash";
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
import { calculateDynamicLeadStatus, getMissingParameterKeyboard, processQualification } from "@/lib/qualification";
import { createGateway } from '@ai-sdk/gateway';
import { getAdaptiveQualificationRule } from "@/lib/sanity/rules";
// ─── ADD THIS TO YOUR IMPORTS AT THE TOP OF THE FILE ───
import { createTenantRedisClient } from "@/lib/upstash"; // 🟢 Import dynamic factory
import { checkPaymentStatus, generateCheckoutSessionToken } from "@/lib/checkout";


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
        return new Response("Bad Request", { status: 400 });
    }

    const { update, tenant } = payload as { update: any; tenant: any };

    if (!update || !tenant) {
        console.error("[QStash Processor] Missing update or tenant payload details context block");
        return new Response("Bad Request: Missing update or tenant context", { status: 400 });
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
                return new Response("Unauthorized Signature", { status: 401 });
            }
            console.log(`[QStash Processor][${tenant.companyName}] Tenant signature verified successfully.`);
        } catch (err) {
            console.error(`[QStash Processor][${tenant.companyName}] Exception during custom signature verification loops:`, err);
            return new Response("Unauthorized", { status: 401 });
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
                return new Response("OK", { status: 200 });
            }
        }

        await processUpdate(update, tenant, tenantClient);
        return new Response("OK", { status: 200 });
    } catch (err: any) {
        console.error(`[QStash Processor][${tenant.companyName}] Error processing message:`, err);
        // Return 500 so QStash knows to retry this task later
        return new Response(`Error: ${err.message}`, { status: 500 });
    }
}

// Core AI processing
async function processUpdate(
    update: any,
    tenant: TenantContext,
    tenantClient: ReturnType<typeof createTenantClient>
): Promise<void> {
    const message = update.message ?? update.edited_message;
    const callbackQuery = update.callback_query;

    let chatId: number;
    let telegramId: string;
    let activeBuyerProfile: any = null;

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
    let forcedBudgetOverride: string | undefined = undefined;
    let forcedTimelineOverride: string | undefined = undefined;
    let isQualificationCallback = false;

    // Handle Callback Queries for Qualification
    if (callbackQuery) {
        const cbData = callbackQuery.data || "";
        // src/app/api/webhook/telegram/process/route.ts

        // ─── 🟢 FIXED: ALIGNED WITH YOUR WORKING INTERCEPTOR INFRASTRUCTURE ───
        // src/app/api/webhook/telegram/process/route.ts

        if (cbData === "payment_poll_check") {
            console.log(`[Polling Interceptor][${tenant.companyName}] User ${telegramId} clicked 'Payment Confirmed'. Polling isolated cache.`);

            // Defuse the Telegram button loading ring instantly to keep the UI highly responsive
            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
            const ackUrl = `https://api.telegram.org/bot${cleanToken}/answerCallbackQuery`;
            try {
                await fetch(ackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
                });
            } catch (e) { }

            // Connect dynamically to the tenant's completely isolated Redis database node
            const tenantRedis = createTenantRedisClient(tenant);

            // ─── RESILIENT SKU RESOLUTION FOR POLL CHECK ───
            // Strategy: The checkout session was seeded with the REAL productSku.
            // We scan the user's active checkout session keys to find it, rather than
            // re-deriving from coreNeed (which is human-readable, not a warehouse SKU).
            let targetProductSku = "";

            // Step 1: Try to find any active checkout:session key for this user
            try {
                const sessionPattern = `checkout:session:${telegramId}:*`;
                const sessionKeys = await tenantRedis.keys(sessionPattern);
                if (sessionKeys && sessionKeys.length > 0) {
                    // Use the most recently written session (last key)
                    const latestKey = sessionKeys[sessionKeys.length - 1];
                    // Extract the SKU from the key: checkout:session:{telegramId}:{sku}
                    const keyParts = (latestKey as string).split(":");
                    targetProductSku = keyParts.slice(3).join(":"); // handles SKUs with colons
                    console.log(`[Polling Interceptor][${tenant.companyName}] Resolved active checkout SKU from session key: "${targetProductSku}"`);
                }
            } catch (scanErr) {
                console.warn(`[Polling Interceptor][${tenant.companyName}] Key scan failed, falling back to coreNeed:`, scanErr);
            }

            // Step 2: Fallback — use coreNeed with fuzzy catalog lookup (handles exact product name/slug)
            if (!targetProductSku) {
                const coreNeedRaw = (activeBuyerProfile?.coreNeed || existingBuyer?.coreNeed || "").trim().toLowerCase();
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

            // 🔄 LOOKUP SYSTEM: Reads the unique namespaced key variant matching the clean SKU code
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

                // Lowercased all structural <b> tag string properties cleanly
                const successText = isAmharic
                    ? `🎉 <b>ክፍያዎ በተሳካ ሁኔታ ተረጋግጧል!</b>\n\nስለ መረጡን እናመሰግናለን! ትዕዛዝዎ <b>📦 ተመዝግቧል</b>። በአሁኑ ወቅት የሽያጭ ቡድናችን ዕቃውን ለእርስዎ ለማዘጋጀት እየሠራ ይገኛል። ለተጨማሪ መረጃ ወይም የማድረሻ ሁኔታን ለመከታተል በቀጥታ እዚህ ያግኙን፦ ${tenant.supportHandle}። መልካም ቀን!`
                    : `🎉 <b>Payment Confirmed Successfully!</b>\n\nThank you for your purchase! Your order for <b>'${payload?.productName || payload?.productSku}'</b> has been securely locked in. Our logistics team is now preparing your fulfillment. For any assistance or delivery updates, feel free to reach out to us at ${tenant.supportHandle}!`;

                await sendFormattedMessage(tenant.telegramBotToken, chatId, successText, "HTML", null);
                return; // 🛑 Complete process termination! User successfully converted.
            } else {
                console.log(`[Polling Interceptor][${tenant.companyName}] No verified payment found yet for user ${telegramId}. Prompting retry.`);

                // Appended your dynamic tenant support handle context link cleanly to the error notice
                const retryNoticeText = isAmharic
                    ? `⚠️ <b>ክፍያዎ ገና አልተመዘገበም</b>\n\nየባንክ ማረጋገጫዎ በአሊጉ የውሂብ ጎታ ላይ እስካሁን አልደረሰም። እባክዎ በድር ጣቢያው ላይ ክፍያውን ማጠናቀቅዎን ያረጋግጡ። ክፍያውን ከፈጸሙ በኋላ ከ10-15 ሰከንድ ይጠብቁ እና እንደገና <b>'ክፍያ አረጋግጫለሁ'</b> የሚለውን ቁልፍ ይጫኑ። ለፈጣን እገዛ የደንበኞች አገልግሎታችንን እዚህ ያግኙ፦ ${tenant.supportHandle}።`
                    : `⚠️ <b>Payment Record Not Found Yet</b>\n\nWe haven't received a secure settlement callback from the payment gateway for your session yet. Please ensure you completed the transaction on the checkout page. If you have already paid, wait 10-15 seconds for the network to sync and tap <b>'I've Confirmed Payment'</b> again. For direct verification assistance, contact our support team at ${tenant.supportHandle}!`;

                await sendFormattedMessage(tenant.telegramBotToken, chatId, retryNoticeText, "HTML", null);
                return; // Terminates safely, allowing them to poll again when ready
            }
        }

        if (cbData === "recommend_init") {
            console.log(`[Recommendation Engine] User initiated a personalized finder journey.`);

            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
            const ackUrl = `https://api.telegram.org/bot${cleanToken}/answerCallbackQuery`;
            try {
                await fetch(ackUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ callback_query_id: callbackQuery.id }),
                });
            } catch (e) { }

            update.message = { text: "recommendation", chat: { id: chatId }, from: callbackQuery.from };
        }

        if (cbData.startsWith("budget_") || cbData.startsWith("timeline_")) {
            console.log(`[Qualification Callback][${tenant.companyName}] Received Button Click: ${cbData}`);
            console.log(`[DIAGNOSTIC 1] Tapped Button Data Token: "${cbData}"`);

            const parts = cbData.split("_");
            const key = parts[0];
            const value = parts.slice(1).join("_");
            if (key === "budget") forcedBudgetOverride = value;
            if (key === "timeline") forcedTimelineOverride = value;
            isQualificationCallback = true;

            console.log(`[DIAGNOSTIC 2] Parsed Components -> Key: "${key}", Value: "${value}"`);

            const updatedFields = {
                budgetRange: key === "budget" ? value : undefined,
                timeline: key === "timeline" ? value : undefined,
                lastQualifiedAt: new Date().toISOString(),
            };

            await createOrUpdateBuyer(telegramId, updatedFields, tenantClient);
            console.log(`[DIAGNOSTIC 3] Sanity patch commit triggered successfully.`);
            const freshlyPatchedBuyer = await getOrCreateBuyer(telegramId, currentUserName, tenantClient);

            const statusMetrics = calculateDynamicLeadStatus(freshlyPatchedBuyer);
            await updateBuyerProfile(telegramId, tenantClient, {
                qualificationStage: statusMetrics.stage,
                leadScore: statusMetrics.score
            });
            console.log(`[DIAGNOSTIC 4] Sanity Fetch Result -> Cache Budget: "${freshlyPatchedBuyer.budgetRange}", Cache Timeline: "${freshlyPatchedBuyer.timeline}"`);

            activeBuyerProfile = {
                ...freshlyPatchedBuyer,
                budgetRange: key === "budget" ? value : (freshlyPatchedBuyer.budgetRange || ""),
                timeline: key === "timeline" ? value : (freshlyPatchedBuyer.timeline || ""),
                qualificationStage: statusMetrics.stage,
                leadScore: statusMetrics.score
            };
            console.log(`[DIAGNOSTIC 5] Final Forced Variable State -> Budget to Step 4: "${activeBuyerProfile.budgetRange}", Timeline to Step 4: "${activeBuyerProfile.timeline}"`);

            const cleanToken = tenant.telegramBotToken.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "");
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
            const simulatedText = "recommendation";
            update.message = { text: simulatedText, chat: { id: chatId }, from: callbackQuery.from };
        }
    }

    const activeMessage = update.message ?? message;

    if (!activeMessage?.text) {
        console.log(`[Bot][${tenant.companyName}] No text in active request payload, skipping AI flow.`);
        return;
    }
    const userText: string = activeMessage.text;
    const userName: string = activeMessage.from?.username ?? activeMessage.from?.first_name ?? "user";

    console.log(`[Bot][${tenant.companyName}] Processing incoming string payload: "${userText}"`);

    // ─── 2. ⚡ HIGH-PERFORMANCE INTENT DE-DUPLICATION SHORTCUT BYPASS ───
    let intentResult;

    if (userText === "recommendation") {
        console.log(`[Shortcut Router] Bypassing AI Intent Router for system recommendation token.`);
        intentResult = {
            intent: "recommendation" as const,
            confidence: 1.0,
            language: (activeBuyerProfile?.preferredLanguage || 'en') as 'am' | 'en',
            params: { category: activeBuyerProfile?.coreNeed || "" }
        };
    } else {
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
    if (userText !== "recommendation") {
        try {
            const rawCat = intentResult.params?.category || existingBuyer?.coreNeed || "";
            const currentCategory = cleanCategoryKeyword(rawCat);
            const adaptiveRuleForQual = await getAdaptiveQualificationRule(tenantClient, currentCategory, intent);

            activeBuyerProfile = await processQualification(telegramId, intentResult, userText, tenantClient, tenant, existingBuyer, adaptiveRuleForQual);

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
        const rawCat = intentResult.params?.category || activeBuyerProfile?.coreNeed || "";
        const currentCategory = cleanCategoryKeyword(rawCat);
        const adaptiveRule = await getAdaptiveQualificationRule(tenantClient, currentCategory, intent);

        let checkBudget = forcedBudgetOverride !== undefined ? forcedBudgetOverride : (activeBuyerProfile?.budgetRange || "");
        if (checkBudget === "trigger_recommendation") checkBudget = "";

        const effectiveBudget = checkBudget;
        const effectiveTimeline = forcedTimelineOverride !== undefined ? forcedTimelineOverride : (activeBuyerProfile?.timeline || "");
        const ruleDisqualifyKey = (adaptiveRule?.disqualificationBudgetKey || "").trim().toLowerCase();
        console.log(`[DIAGNOSTIC 7] Interceptor Verification -> Budget: "${effectiveBudget}", Timeline: "${effectiveTimeline}"`);

        if (ruleDisqualifyKey !== "" && effectiveBudget !== "" && effectiveBudget === ruleDisqualifyKey) {
            console.log(`[Lifecycle Engine][${tenant.companyName}] Disqualification threshold hit! Committing direct state patch to database.`);

            await updateBuyerProfile(telegramId, tenantClient, {
                qualificationStage: 'disqualified',
                leadScore: 0
            });

            const defaultTextAm = `ስለ ፍላጎትዎ እናመሰግናለን! በአሁኑ ወቅት በ${currentCategory} ዘርፍ ትኩረት የምናቀርበው ከ 50,000 ብር በላይ በሆኑ የንግድ ድርጅቶች ጥቅሎች ላይ ብቻ ነው። ነገር ግን ሌሎች ምርቶቻችንን ለማየት ወደ ዋናው ማውጫ መመለስ ወይም ሌላ ዘርፍ መምረጥ ይችላሉ! @aligoo_support`;
            const defaultTextEn = `Thank you for your interest! In our '${currentCategory}' line, we focus exclusively on commercial corporate packages starting at 50,000 ETB. However, you are completely free to explore our other categories right here: @aligoo_support`;

            const exitText = userLanguage === 'am'
                ? (adaptiveRule?.customDisqualifiedPromptAm || defaultTextAm)
                : (adaptiveRule?.customDisqualifiedPromptEn || defaultTextEn);

            await sendFormattedMessage(tenant.telegramBotToken, chatId, exitText, "HTML");
            return;
        }

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
        buyerProfile: activeBuyerProfile
    };

    try {
        if (intent === "recommendation") {
            const bounds = getBudgetBounds(activeBuyerProfile.budgetRange);
            const rawCat = intentResult.params?.category || activeBuyerProfile?.coreNeed || "";
            const targetCat = cleanCategoryKeyword(rawCat);
            console.log(`[Context Engine] Pre-fetching recommendations for Cat: "${targetCat}" between ${bounds.min} - ${bounds.max}`);
            const matches = await getProductRecommendations(tenantClient, targetCat, bounds.min, bounds.max);

            if (matches.length === 0) {
                console.log(`[Lifecycle Engine][${tenant.companyName}] Zero price-matched items found. Disqualifying user.`);

                await updateBuyerProfile(telegramId, tenantClient, {
                    qualificationStage: 'disqualified',
                    leadScore: 0
                });

                const currentCategory = targetCat || "electronics";
                const adaptiveRule = await getAdaptiveQualificationRule(tenantClient, currentCategory, intent);

                const defaultTextAm = `ስለ ፍላጎትዎ እናመሰግናለን! በአሁኑ ወቅት በ${currentCategory} ዘርፍ በዚህ የዋጋ ክልል ውስጥ የሚገኙ ምርቶች የሉንም። እባክዎ ሌሎች ምርቶቻችንን ለማየት ወደ ዋናው ማውጫ ይመለሱ ወይም ሌላ ዘርፍ ይምረጡ! @aligoo_support`;
                const defaultTextEn = `Thank you for your interest! We currently do not have any items in our '${currentCategory}' category within this budget range. However, you are completely free to explore other categories or contact support: @aligoo_support`;

                const exitText = userLanguage === 'am'
                    ? (adaptiveRule?.customDisqualifiedPromptAm || defaultTextAm)
                    : (adaptiveRule?.customDisqualifiedPromptEn || defaultTextEn);

                await sendFormattedMessage(tenant.telegramBotToken, chatId, exitText, "HTML");
                return;
            }

            sanityContext = JSON.stringify(matches);
            prompt = buildRecommendationPrompt({ ...ctx, sanityContext });
        }
        else if (intent === "product_browse") {
            const products = await getProductList(tenantClient, intentResult.params?.category);
            sanityContext = products.length > 0 ? JSON.stringify(products) : "No items found in this category.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
            activeReplyMarkup = {
                inline_keyboard: [
                    [
                        {
                            text: userLanguage === 'am' ? "🤖 ለእኔ የሚሆን ምርጫ አሳይ" : "🤖 Get Personalized Recommendation",
                            callback_data: "recommend_init"
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
            // The raw product code token the user typed or clicked (e.g., "sam-a35-256gb")
            const inputSku = (intentResult.params?.slug || activeBuyerProfile?.coreNeed || "").trim().toLowerCase();

            // 🔍 VALIDATION GUARD: Verify if an explicit product slug was selected
            if (!inputSku || inputSku.trim() === "") {
                console.log(`[Order Funnel][${tenant.companyName}] User initiated purchase intent without specifying a product slug.`);

                // Keep the flow conversational so Gemini guides them to choose a product first
                prompt = buildSupportPrompt({
                    ...ctx,
                    sanityContext: "The user wants to buy an item but did not provide a specific product code or SKU. Look at the context, and politely ask them to specify which item SKU they want to lock in."
                });
            } else {
                console.log(`[Order Funnel][${tenant.companyName}] Querying catalog directly for SKU: "${inputSku}"`);

                // 🔍 TWO-PASS PRODUCT LOOKUP STRATEGY:
                // Pass 1 — Exact match on productSku and slug (normalized: spaces→hyphens)
                // Pass 2 — GROQ `match` word-based fuzzy search on product name
                // Handles: "mac book pro"→"MacBook Pro", "automatic-coffee-maker"→"Automatic Coffee Maker"
                // Clean up string noise from free-form user speech inputs
                const cleanInput = inputSku.trim();
                const normalizedSlug = cleanInput.toLowerCase().replace(/\s+/g, "-"); // "Samsung Galaxy A35" -> "samsung-galaxy-a35"
                const wildInput = `${cleanInput}*`; // Creates a suffix search token for fuzzy string matches
                console.log(`[Order Funnel][${tenant.companyName}] Running resilient search for: "${cleanInput}" (Slug: "${normalizedSlug}")`);

                // 🔄 UPDATED HIGH-VELOCITY CASE-INSENSITIVE MULTI-MATCH QUERY
                const productData = await tenantClient.fetch(
                    `*[_type == "product" && (
                        lower(productSku) == lower($cleanInput) ||
                        lower(productSku) == lower($normalizedSlug) ||
                        lower(slug.current) == lower($cleanInput) ||
                        lower(slug.current) == lower($normalizedSlug) ||
                        lower(name) == lower($cleanInput) ||
                        name match $cleanInput ||
                        name match $wildInput
                    )][0]{ productSku, name }`,
                    { cleanInput, normalizedSlug, wildInput }
                );

                console.log(`[Order Funnel][${tenant.companyName}] Catalog lookup result for "${inputSku}": ${JSON.stringify(productData)}`);

                // 🛡️ CRITICAL SKU GUARD: If no verified catalog product was found, do NOT generate
                // a checkout URL. The SKU must come from the database — never from coreNeed fallback,
                // which is a human-readable description (e.g., "macbook pro") not a warehouse SKU.
                // 🔄 FIXED CONVERSION INTERCEPTOR GUARD:
                // We verify that a valid product row was found by checking BOTH schema properties safely!
                if (!productData || (!productData.productSku && !productData.name)) {
                    console.warn(`[Order Funnel][${tenant.companyName}] No verified catalog match found for: "${cleanInput}". Aborting checkout link.`);

                    // Keeps execution conversational without crashing your serverless instances
                    prompt = buildSupportPrompt({
                        ...ctx,
                        sanityContext: `The user expressed intent to buy something, but we could not find any product match for "${cleanInput}" in our inventory database. Do NOT generate a checkout link. Politely inform them we couldn't locate that specific item, and invite them to double check the name or type 'show product list' to see all options.`
                    });
                } else {
                    // ✅ Verified catalog SKU — safe to generate checkout session
                    const activeSku = productData.productSku;
                    const productName = productData.name || activeSku;

                    console.log(`[Order Funnel][${tenant.companyName}] Verified catalog SKU: "${activeSku}" for product: "${productName}"`);

                    // Create your secure ephemeral session verification token
                    const sessionToken = generateCheckoutSessionToken(telegramId, activeSku);

                    // 2. Compile our unified multitenant session cache payload mapping object
                    const sessionPayload = {
                        sessionToken,
                        tenantId: tenant.id,
                        telegramId,
                        productSku: activeSku, // ← Always the real warehouse SKU from Sanity
                        productName,
                        status: "pending_payment",
                        createdAt: new Date().toISOString()
                    };

                    // 3. Connect dynamically to the tenant's completely isolated Redis database node
                    const tenantRedis = createTenantRedisClient(tenant);
                    const sessionCacheKey = `checkout:session:${telegramId}:${activeSku}`;
                    try {
                        // Seed the session state token into memory with a clean 30-minute TTL expiration (1800s)
                        await tenantRedis.set(sessionCacheKey, JSON.stringify(sessionPayload), { ex: 1800 });
                        console.log(`[Order Funnel][${tenant.companyName}] Secure checkout session token seeded in isolated memory: ${sessionToken}`);
                    } catch (redisErr) {
                        console.error(`[Order Funnel][${tenant.companyName}] Failed to seed transaction tokens to Redis:`, redisErr);
                    }

                    // 4. Construct the localized persuasion prompt for Gemini to act as a closing agent
                    prompt = buildSupportPrompt({
                        ...ctx,
                        sanityContext: `CRITICAL CONVERSION INSTRUCTION:
- The user is checking out for the product: "${productName}" (SKU: ${activeSku}).
- A dynamic 1-click checkout inline keyboard link has been generated and appended below your response text window by the platform transport layers.
- Do NOT instruct them to contact human support handles here.
- Instead, enthusiastically confirm their selection, explain that their customized web secure sandbox checkout link is ready right below, and tell them to tap it to complete their mobile payment transaction securely!`
                    });

                    // 5. ─── 🟢 BUILD CONVERSION BUTTON ROWS ───
                    const vercelHost = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || "localhost:3000";
                    const protocol = vercelHost.includes("localhost") ? "http" : "https";
                    const sandboxUrl = `${protocol}://${vercelHost}/checkout-sandbox?sessionToken=${sessionToken}&tenantId=${tenant.id}&telegramId=${telegramId}&productSku=${activeSku}&productName=${encodeURIComponent(productName)}`;
                    activeReplyMarkup = {
                        inline_keyboard: [
                            // ROW 1: The high-intent direct action web checkout gateway redirect trigger link
                            [
                                {
                                    text: userLanguage === 'am' ? "💳 ክፍያ ፈጽም (የሙከራ ገጽ)" : "💳 Proceed to Web Checkout",
                                    url: sandboxUrl
                                }
                            ],
                            // ROW 2: The local polling listener button to re-evaluate Redis cache transaction confirmations
                            [
                                {
                                    text: userLanguage === 'am' ? "✅ ክፍያ አረጋግጫለሁ" : "✅ I've Confirmed Payment",
                                    callback_data: `payment_poll_check`
                                }
                            ]
                        ]
                    };
                }
            }

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
            system: `${buildSystemPrompt(tenant)}${languageConstraint}`,
            prompt,
            tools,
            providerOptions: {
                google: {
                    useProduction: true,
                },
                gateway: {
                    order: ['google'],
                    models: ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-preview-09-2025'],
                },
                maxSteps: 5,
            } as any,
        });

        replyText = result.text;

        if (!replyText || replyText.trim() === "") {
            console.warn(`[Bot][${tenant.companyName}] AI returned a blank response text string. Applying fallback message.`);

            replyText = userLanguage === 'am'
                ? `ይቅርታ፣ አሁን ላይ መረጃውን ማግኘት አልቻልኩም። እባክዎ ጥያቄዎን በሌላ አገላለጽ እንደገና ይሞክሩት ወይም እዚህ ያግኙን፡ ${tenant.supportHandle}`
                : `I couldn't retrieve that information right now. Please try rephrasing your request or reach out to us at ${tenant.supportHandle}.`;
        }

        if (replyText.includes("üllttool_code")) {
            replyText = replyText.replace(/üllttool_code/g, "");
        }

    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] AI multi-step execution failed completely:`, err);
        replyText = userLanguage === 'am'
            ? `⚠️ ይቅርታ፣ መረጃውን ማግኘት አልቻልኩም። እባክዎ እንደገና ይሞክሩ ወይም እዚህ ያግኙን፡ ${tenant.supportHandle}።`
            : `⚠️ I'm sorry, I encountered an issue processing that. Please try again or contact support at ${tenant.supportHandle}.`;
    }

    console.log(`[Bot][${tenant.companyName}] AI finalized reply payload:`, replyText.slice(0, 100));

    try {
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
