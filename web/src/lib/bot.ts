// src/lib/bot.ts
/**
 * Multi-Platform Bot Adapter Layer
 *
 * This module initialises the Chat adapter framework for platforms beyond the primary
 * Telegram webhook flow (e.g., future: WhatsApp, Instagram, Slack).
 *
 * The primary message processing path is:
 *   POST /api/webhook/telegram/route.ts → processUpdate() → AI pipeline
 *
 * This file handles the "Chat" framework adapter lifecycle and can be extended
 * per-platform. Tenant context is injected at the handler level.
 */

import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import type { TenantContext } from "@/types/tenant";
import { createTenantClient } from "@/sanity/client";
import { getBuyer, updateBuyerInteraction } from "./sanity/buyer";
import { handleOnboarding } from "./onboarding";
import { detectIntent } from "./ai/intent";
import {
    buildSystemPrompt,
    buildGreetingPrompt,
    buildFallbackPrompt,
    buildSalesPrompt,
    buildInfoPrompt,
    buildSupportPrompt,
} from "./ai/prompts";
import { buildSanityTools } from "./ai/tools";
import { getProductList, getProductDetails, getFAQs } from "./sanity/queries";
import { generateText } from "ai";

// ─── Redis State Adapter (shared across all adapters) ─────────────────────────
const stateAdapter = createRedisState();

// ─── Conversation History Helpers ─────────────────────────────────────────────
async function getConversationHistory(threadId: string, limit = 8) {
    try {
        const key = `history:${threadId}`;
        const history = await stateAdapter.getList?.(key);
        if (!history || !Array.isArray(history)) return [];
        return history.slice(-limit);
    } catch (e) {
        console.error("[Memory] Failed to load history:", e);
        return [];
    }
}

async function saveToHistory(threadId: string, role: "user" | "assistant", content: string) {
    try {
        const key = `history:${threadId}`;
        await stateAdapter.appendToList?.(key, { role, content, timestamp: Date.now() });
    } catch (e) {
        console.error("[Memory] Failed to save history:", e);
    }
}

// ─── Core AI Handler (tenant-aware) ───────────────────────────────────────────
/**
 * Handles an incoming message for a given tenant.
 * Used by the Chat adapter framework for non-webhook platforms.
 *
 * @param thread - Chat framework thread object
 * @param message - Incoming message from the adapter
 * @param tenant - Resolved TenantContext for this bot instance
 */
async function handleAIResponse(thread: any, message: any, tenant: TenantContext) {
    const tenantClient = createTenantClient(tenant);
    const telegramId = message.from?.id?.toString() || message.chat?.id?.toString() || "unknown";
    const threadId = thread.id || telegramId;
    const userName: string = message.from?.username ?? message.from?.first_name ?? "user";

    try {
        console.log(`[Bot][${tenant.companyName}] Processing message for user ${telegramId}`);
        await thread.subscribe();

        const userText = typeof message.text === "string"
            ? message.text
            : (message.content?.text ?? "Hello");

        // Check onboarding status
        const buyer = await getBuyer(telegramId, tenantClient);
        if (!buyer || buyer.onboardingStep !== "completed") {
            const result = await handleOnboarding(thread, message, buyer, telegramId, tenant, tenantClient);
            if (result.handled && result.response) {
                await thread.post(result.response.text);
            }
            return;
        }

        // Intent detection
        const intentResult = await detectIntent(userText, tenant).catch(() => ({
            intent: "unknown" as const,
            confidence: 0,
            params: undefined,
        }));

        // Build prompt
        const ctx = { userName, userMessage: userText, detectedIntent: intentResult.intent, tenant };
        let sanityContext = "";
        let prompt = "";

        if (intentResult.intent === "product_browse") {
            const products = await getProductList(tenantClient, intentResult.params?.category);
            sanityContext = products.length > 0 ? JSON.stringify(products) : "No items found.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
        } else if (intentResult.intent === "product_detail" && intentResult.params?.slug) {
            const product = await getProductDetails(tenantClient, intentResult.params.slug);
            sanityContext = product ? JSON.stringify(product) : "Item not found.";
            prompt = buildSalesPrompt({ ...ctx, sanityContext });
        } else if (intentResult.intent === "faq") {
            const faqs = await getFAQs(tenantClient, intentResult.params?.faqCategory);
            sanityContext = faqs.length > 0 ? JSON.stringify(faqs) : "No FAQs found.";
            prompt = buildInfoPrompt({ ...ctx, sanityContext });
        } else if (intentResult.intent === "order") {
            prompt = buildSupportPrompt({ ...ctx, sanityContext: `Contact ${tenant.supportHandle}` });
        } else if (intentResult.intent === "greeting") {
            prompt = buildGreetingPrompt(ctx);
        } else {
            prompt = buildFallbackPrompt(ctx);
        }

        // Conversation history
        const history = await getConversationHistory(threadId, 8);

        const tools = buildSanityTools(tenantClient, tenant);
        const result = await generateText({
            model: "google/gemini-2.5-flash-lite" as any,
            system: buildSystemPrompt(tenant),
            messages: [
                ...history.map((msg: any) => ({ role: msg.role, content: msg.content })),
                { role: "user" as const, content: prompt },
            ],
            tools,
            maxSteps: 5,
        } as any);

        const replyText = result.text || "Sorry, I couldn't generate a response right now.";

        // Persist to history
        await saveToHistory(threadId, "user", userText);
        await saveToHistory(threadId, "assistant", replyText);
        await updateBuyerInteraction(telegramId, tenantClient);

        await thread.post(replyText);

    } catch (error: any) {
        console.error(`[Bot][${tenant.companyName}] ERROR in handleAIResponse:`, error?.message ?? error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}

// ─── Bot Factory ───────────────────────────────────────────────────────────────
/**
 * Creates a Chat adapter bot instance for a specific tenant.
 * Call this once per tenant when setting up adapters (not per-request).
 *
 * @param tenant - The TenantContext for this bot
 */
export function createBotForTenant(tenant: TenantContext): Chat {
    const bot = new Chat({
        userName: `${tenant.subdomain}_bot`,
        adapters: {
            telegram: createTelegramAdapter({
                secretToken: tenant.telegramWebhookSecret,
                botToken: tenant.telegramBotToken,
            }),
        },
        state: createRedisState(),
        concurrency: "queue",
        lockScope: "channel",
    });

    // Register handlers — inject tenant via closure
    bot.onDirectMessage(async (thread, message) =>
        await handleAIResponse(thread, message, tenant)
    );
    bot.onNewMention(async (thread, message) =>
        await handleAIResponse(thread, message, tenant)
    );

    return bot;
}