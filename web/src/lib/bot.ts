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
import type { TenantConfig, TenantContext } from "@/types/tenant";
import { createTenantClient } from "@/sanity/client";
import { getBuyer } from "./sanity/buyer";
import { handleOnboarding } from "./onboarding";
import { detectIntent } from "./ai/intent";
import { createTenantRedisClient } from "@/lib/upstash";
import { handleStructured } from "@/services/bot/structured";
import { handleSearch } from "@/services/bot/search";
import { handleGeneral } from "@/services/bot/general";
import { BotServiceArgs } from "@/types/bot";
import { handleOrder } from "@/services/bot/order";
import { handleQualification } from "@/services/bot/qualification";
import { handleRecommendation } from "@/services/bot/recommendation";

// ─── Core AI Handler (tenant-aware) ───────────────────────────────────────────
/**
 * Handles an incoming message for a given tenant.
 * Used by the Chat adapter framework for non-webhook platforms.
 *
 * @param thread - Chat framework thread object
 * @param message - Incoming message from the adapter
 * @param tenantContext - Resolved TenantContext from the closure registry
 */
async function handleAIResponse(thread: any, message: any, tenantContext: TenantContext) {
    const tenantClient = createTenantClient(tenantContext);

    // 1. 🔄 Fetch the fully isolated, type-safe Upstash Redis client instance block
    const tenantRedisInstance = createTenantRedisClient(tenantContext);

    // 2. 🟢 FIXED TYPE SEGREGATION: Pass the native instance straight to the adapter
    const tenantStateAdapter = createRedisState({
        client: tenantRedisInstance as any
    });

    const telegramId = message.from?.id?.toString() || message.chat?.id?.toString() || "unknown";
    const threadId = thread.id || telegramId;

    try {
        console.log(`[Bot][${tenantContext.companyName}] Processing message for user ${telegramId}`);
        await thread.subscribe();

        // 3. 🟢 RESOLVE USER TEXT SAFELY
        const userText = typeof message.text === "string"
            ? message.text
            : (message.content?.text ?? "Hello");

        // 4. Check onboarding verification boundaries before running AI engines
        const buyer = await getBuyer(telegramId, tenantClient);
        if (!buyer || buyer.onboardingStep !== "completed") {
            const result = await handleOnboarding(thread, message, buyer, telegramId, tenantContext, tenantClient);
            if (result.handled && result.response) {
                await thread.post(result.response.text);
            }
            return;
        }

        // 5. ⚡ INVOLKE DYNAMIC INTENT DETECTOR INTERCEPTOR GATE
        // We evaluate the user query against our Redis-cached cheap classifier model
        const intentResult = await detectIntent(userText, tenantContext);
        console.log(`[Gatekeeper][${tenantContext.companyName}] Intent parsed: ${intentResult.intent} (Conf: ${intentResult.confidence})`);

        // Typecast context objects safely downstream to match our unified service interfaces
        const castedTenantConfig = tenantContext as unknown as TenantConfig;

        const args: BotServiceArgs = {
            chatId: threadId,
            thread,
            intentResult,
            tenant: castedTenantConfig,
            userText,
        };

        // ─── 🛡️ SECURITY SHIELD A: CONFIDENCE THRESHOLD GUARD ───
        if (intentResult.confidence < 0.6) {
            console.log(`[Gatekeeper][${tenantContext.companyName}] Low classification confidence (${intentResult.confidence}). Routing to Route C.`);
            return handleGeneral(args);
        }

        // 4. 🚦 DYNAMIC HYBRID SWITCH MATRIX
        switch (intentResult.intent) {

            // ✅ ROUTE A: Structured Price/SKU Catalog Browser
            case "product_browse":
            case "product_detail":
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to Structured Service (Route A).`);
                return handleStructured(args);

            // ✅ ROUTE B: Unstructured Meaning-Based Semantic Discovery
            case "unstructured_search":
            case "faq":
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to Semantic Search Service (Route B).`);
                return handleSearch(args);

            // ✅ ROUTE D: BANT Survey State Consolidation Recommendation Matrix
            case "recommendation":
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to Recommendation Service (Route D).`);
                return handleRecommendation(args);

            // ✅ ROUTE E: Cryptographic Transaction Order Compiler
            case "order":
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to Transactional Order Service (Route E).`);
                return handleOrder(args);

            // ✅ ROUTE F: Interactive Multi-Choice BANT Questionnaire Survey
            case "qualification":
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to Onboarding Qualification Service (Route F).`);
                return handleQualification(args);

            // ✅ ROUTE C: Conversational Small Talk Fallbacks ($0 Token Costs)
            case "unknown":
            default:
                console.log(`[Gatekeeper][${tenantContext.companyName}] Routing to General Conversational Service (Route C).`);
                return handleGeneral(args);
        }
    } catch (error: any) {
        console.error(`[Bot][${tenantContext.companyName}] ERROR in handleAIResponse:`, error?.message ?? error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}

// ─── Bot Factory ───────────────────────────────────────────────────────────────
/**
 * Creates a Chat adapter bot instance for a specific tenant.
 * Call this once per tenant when setting up adapters (not per-request).
 *
 * @param tenant - The TenantContext for this bot instance
 */
export function createBotForTenant(tenant: TenantContext): Chat {
    // 1. 🔄 Fetch the fully isolated, type-safe Upstash Redis client instance block
    const tenantRedisInstance = createTenantRedisClient(tenant);

    // 2. Pass the native instance straight to the adapter wrapper
    const tenantState = createRedisState({
        client: tenantRedisInstance as any
    });

    const bot = new Chat({
        userName: `${tenant.subdomain}_bot`,
        adapters: {
            telegram: createTelegramAdapter({
                secretToken: tenant.telegramWebhookSecret,
                botToken: tenant.telegramBotToken,
            }),
        },
        state: tenantState,
        concurrency: "queue",
        lockScope: "channel",
    });

    // Register handlers — inject tenant via clean closure mapping mechanics
    bot.onDirectMessage(async (thread, message) =>
        await handleAIResponse(thread, message, tenant)
    );
    bot.onNewMention(async (thread, message) =>
        await handleAIResponse(thread, message, tenant)
    );

    return bot;
}
