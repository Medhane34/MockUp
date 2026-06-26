// src/app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateText } from "ai";
import { adminClient, createTenantClient } from "@/sanity/client";
import { detectIntent } from "@/lib/ai/intent";
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
    if (!message?.text) {
        console.log(`[Bot][${tenant.companyName}] No text in update, skipping AI flow.`);
        return;
    }

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const telegramId = message.from?.id?.toString() || chatId.toString();
    const userName: string = message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot][${tenant.companyName}] Message from ${userName}: "${userText}"`);

    // 1. Intent Detection (niche-aware)
    let intentResult;
    try {
        intentResult = await detectIntent(userText, tenant);
    } catch (err) {
        console.error(`[Bot][${tenant.companyName}] Intent detection error:`, err);
        intentResult = { intent: "unknown" as const, confidence: 0, params: undefined };
    }

    // 2. Fetch context and build prompt based on intent
    let sanityContext = "";
    let prompt = "";
    const ctx = { userName, userMessage: userText, detectedIntent: intentResult.intent, tenant };

    try {
        if (intentResult.intent === "product_browse") {
            const products = await getProductList(tenantClient, intentResult.params?.category);
            sanityContext = products.length > 0
                ? JSON.stringify(products.map((p) => ({
                    name: p.name, slug: p.slug, price: p.price, inStock: p.inStock, category: p.category,
                })))
                : "No items found in this category.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });

        } else if (intentResult.intent === "product_detail") {
            let product = null;
            if (intentResult.params?.slug) {
                product = await getProductDetails(tenantClient, intentResult.params.slug);
            }
            sanityContext = product
                ? JSON.stringify({
                    name: product.name, slug: product.slug, price: product.price,
                    inStock: product.inStock, stockQuantity: product.stockQuantity,
                    description: product.description, features: product.features,
                })
                : "Item not found. Please check the name/spelling.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });

        } else if (intentResult.intent === "faq") {
            const faqs = await getFAQs(tenantClient, intentResult.params?.faqCategory);
            sanityContext = faqs.length > 0
                ? JSON.stringify(faqs.map((f) => ({ question: f.question, answer: f.answer, category: f.category })))
                : "No FAQs found.";
            prompt = buildInfoPrompt({ ...ctx, sanityContext });

        } else if (intentResult.intent === "order") {
            prompt = buildSupportPrompt({
                ...ctx,
                sanityContext: `Direct user to contact support at ${tenant.supportHandle} to complete their order.`,
            });

        } else if (intentResult.intent === "greeting") {
            prompt = buildGreetingPrompt(ctx);

        } else {
            prompt = buildFallbackPrompt(ctx);
        }
    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] Context retrieval failed:`, err);
        prompt = buildFallbackPrompt({ ...ctx, sanityContext: "Error retrieving catalog data." });
    }

    console.log(`[Bot][${tenant.companyName}] Calling AI...`);

    // 3. Generate AI response via Vercel AI Gateway
    let replyText = "";
    try {
        const tools = buildSanityTools(tenantClient, tenant);
        const result = await generateText({
            model: "google/gemini-2.5-flash-lite" as any,
            system: buildSystemPrompt(tenant),
            prompt,
            tools,
            maxSteps: 5,
        } as any);
        replyText = result.text;
    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] AI execution failed:`, err);
        replyText = `⚠️ I'm sorry, I encountered an error. Please try again or contact ${tenant.supportHandle}.`;
    }

    console.log(`[Bot][${tenant.companyName}] AI responded:`, replyText.slice(0, 100));

    // 4. Send response to Telegram
    try {
        await sendFormattedMessage(tenant.telegramBotToken, chatId, replyText, "HTML");
        console.log(`[Bot][${tenant.companyName}] Reply sent to Telegram.`);
    } catch (err: any) {
        console.error(`[Bot][${tenant.companyName}] Failed to send Telegram message:`, err);
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
