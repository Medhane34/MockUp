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
} from "@/lib/ai/prompts";
import { buildSanityTools } from "@/lib/ai/tools";
import { sendFormattedMessage } from "@/lib/telegram/format";
import { getProductList, getProductDetails, getFAQs } from "@/lib/sanity/queries";
import type { TenantContext } from "@/types/tenant";
import { getQualificationKeyboard, processQualification } from "@/lib/qualification";
import { createOrUpdateBuyer, getBuyer } from "@/lib/sanity/buyer";
import { any } from "zod";
import { google } from "@ai-sdk/google";

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

    // Handle Callback Queries for Qualification
    if (callbackQuery) {
        const cbData = callbackQuery.data || "";

        if (cbData.startsWith("interest_") || cbData.startsWith("budget_") || cbData.startsWith("timeline_")) {
            console.log(`[Qualification Callback][${tenant.companyName}] Received: ${cbData}`);

            const key = cbData.split("_")[0];
            const value = cbData.split("_")[1];

            await createOrUpdateBuyer(telegramId, {
                interests: key === "interest" ? [value] : undefined,
                budgetRange: key === "budget" ? value : undefined,
                timeline: key === "timeline" ? value : undefined,
                lastQualifiedAt: new Date().toISOString(),
            }, tenantClient);

            await sendFormattedMessage(
                tenant.telegramBotToken,
                chatId,
                "Thank you! Got it. 🎉\n\nAnything else I can help with?",
                "HTML" // Swapped to HTML for unified parsing engine stability
            );
            return;
        }
    }

    if (!message?.text) {
        console.log(`[Bot][${tenant.companyName}] No text in update, skipping AI flow.`);
        return;
    }
    const userText: string = message.text;
    const userName: string = message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot][${tenant.companyName}] Message from ${userName}: "${userText}"`);

    // 1. Intent & Language Detection
    let intentResult;
    try {
        intentResult = await detectIntent(userText, tenant);
    } catch (err) {
        console.error(`[Bot][${tenant.companyName}] Intent detection error:`, err);
        intentResult = { intent: "unknown" as const, confidence: 0, language: 'en' as const, params: undefined };
    }

    const intent = intentResult.intent as string;
    const userLanguage = intentResult.language || 'en';
    const ctx = { userName, userMessage: userText, detectedIntent: intentResult.intent, tenant, userLanguage };

    // 2. Pre-Populate Static Context Rules for Baseline Prompt Fallbacks
    let sanityContext = "";
    let prompt = "";

    try {
        if (intent === "product_browse") {
            const products = await getProductList(tenantClient, intentResult.params?.category);
            sanityContext = products.length > 0 ? JSON.stringify(products) : "No items found in this category.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
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
            /*  // 🔄 WRAPPED WITH FALLBACK: Protects your account from 429 quota exhaustion 
             model: fallback([
                 google("gemini-1.5-flash"),
                 google("gemini-2.5-flash"),
                 google("gemini-2.5-flash-lite")
             ]), */
            model: google("gemini-2.5-flash"),
            system: `${buildSystemPrompt(tenant)}${languageConstraint}`, // Forces runtime language adherence
            prompt,
            tools,
            providerOptions: {
                gateway: {
                    models: ['google/gemini-2.5-flash', 'google/gemini-2.5-flash-preview-09-2025'], // Fallback models
                },
                maxSteps: 5,
            } as any,

        });

        replyText = result.text;

        // Validation interceptor against token leaks or internal compiler strings
        if (!replyText || replyText.trim() === "" || replyText.includes("üllttool_code")) {
            throw new Error("AI pipeline returned empty string or corrupted compiler tokens.");
        }

    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] AI multi-step execution failed completely:`, err);
        // Multilingual fallback resilience
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
        await sendFormattedMessage(tenant.telegramBotToken, chatId, replyText, "HTML");
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
        const result = await handleOnboarding(null, update, buyer, telegramId, tenant, tenantClient);

        if (result.handled && result.response) {
            await sendFormattedMessage(
                tenant.telegramBotToken,
                chatId,
                result.response.text,
                "HTML",
                result.response.replyMarkup ?? null
            );
        }
    } catch (e) {
        console.error(`[Onboarding Handler][${tenant.companyName}] Failed:`, e);
        await sendFormattedMessage(
            tenant.telegramBotToken,
            chatId,
            `Welcome to ${tenant.companyName}! Type /start to begin.`,
            null
        );
    }
}
