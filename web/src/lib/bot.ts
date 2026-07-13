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
import { createRedisState } from "@chat-adapter/state-redis"; // Used only by Chat framework adapter factory
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
import { getConversationHistory } from "./ai/conversation";
import { TenantConfig } from "@/types/tenant";

// ─── Core AI Handler (tenant-aware) ───────────────────────────────────────────
/**
 * Handles an incoming message for a given tenant.
 * Used by the Chat adapter framework for non-webhook platforms.
 *
 * @param thread - Chat framework thread object
 * @param message - Incoming message from the adapter
 * @param tenantConfig - Resolved TenantConfig from the closure registry
 */
async function handleAIResponse(thread: any, message: any, tenantConfig: TenantConfig) {
    const tenantClient = createTenantClient(tenantConfig);

    // 1. Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenantConfig);

    const telegramId = message.from?.id?.toString() || message.chat?.id?.toString() || "unknown";
    const threadId = thread.id || telegramId;
    const chatId = threadId;

    try {
        console.log(`[Bot][${tenantConfig.companyName}] Processing message for user ${telegramId}`);
        await thread.subscribe();

        // 4. 🔍 FETCH ISOLATED CONVERSATION HISTORY FROM UPSTASH CACHE
        const rawHistory = await getConversationHistory(tenantRedisInstance, chatId, tenantConfig).catch((err) => {
            console.error(`[Bot History Sync][${tenantConfig.companyName}] Fetch failure:`, err.message);
            return [];
        });
        const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];

        // 5. RESOLVE USER TEXT SAFELY
        const userText = typeof message.text === "string"
            ? message.text
            : (message.content?.text ?? "Hello");

        // 6. Check onboarding verification boundaries before running AI engines
        const buyer = await getBuyer(telegramId, tenantClient);
        if (!buyer || buyer.onboardingStep !== "completed") {
            const result = await handleOnboarding(thread, message, buyer, telegramId, tenantConfig, tenantClient);
            if (result.handled && result.response) {
                await thread.post(result.response.text);
            }
            return;
        }

        // 7. ⚡ INVOLKE DYNAMIC INTENT DETECTOR INTERCEPTOR GATE
        const intentResult = await detectIntent(userText, tenantConfig);
        console.log(`[Gatekeeper][${tenantConfig.companyName}] Intent parsed: ${intentResult.intent} (Conf: ${intentResult.confidence})`);

        const args: BotServiceArgs = {
            chatId: threadId,
            thread,
            intentResult,
            tenant: tenantConfig,
            userText,
        };

        // ─── 🛡️ SECURITY SHIELD A: CONFIDENCE THRESHOLD GUARD ───
        if (intentResult.confidence < 0.6) {
            console.log(`[Gatekeeper][${tenantConfig.companyName}] Low classification confidence (${intentResult.confidence}). Routing to Route C.`);
            return handleGeneral(args);
        }

        // 8. 🚦 TRIPLE-TRACK ROUTING DISPATCH MATRIX WITH CLEAN INTENT EXECUTORS
        switch (intentResult.intent) {

            // ✅ ROUTE A: Structured Price/SKU Catalog Browser
            case "product_browse":
            case "product_detail":
            case "faq":
                console.log(`[Gatekeeper][${tenantConfig.companyName}] Routing to Structured Service (Route A).`);
                return handleStructured(args);

            // ✅ ROUTE B: Unstructured Meaning-Based Semantic Discovery
            case "unstructured_search":
                console.log(`[Gatekeeper][${tenantConfig.companyName}] Routing to Semantic Search Service (Route B).`);
                return handleSearch(args);

            // ✅ ROUTE D: BANT Survey State Consolidation Recommendation Matrix
            case "recommendation":
            case "qualification":
                console.log(`[Gatekeeper][${tenantConfig.companyName}] Routing to Recommendation Service (Route D).`);
                return handleRecommendation(args);

            // ✅ ROUTE E: Cryptographic Transaction Order Compiler
            case "order":
                console.log(`[Gatekeeper][${tenantConfig.companyName}] Routing to Transactional Order Service (Route E).`);
                return handleOrder(args);

            // ✅ ROUTE C: Conversational Small Talk Fallbacks ($0 Token Costs)
            case "unknown":
            default:
                console.log(`[Gatekeeper][${tenantConfig.companyName}] Routing to General Conversational Service (Route C).`);
                return handleGeneral(args);
        }
    } catch (error: any) {
        console.error(`[Bot][${tenantConfig.companyName}] ERROR in handleAIResponse:`, error?.message ?? error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}

// ─── Bot Factory ───────────────────────────────────────────────────────────────
/**
 * Creates a Chat adapter bot instance for a specific tenant.
 * Call this once per tenant when setting up adapters (not per-request).
 *
 * @param tenantConfig - The TenantConfig interface source for this bot instance
 */
export function createBotForTenant(tenantConfig: TenantConfig): Chat {
    const tenantRedisInstance = createTenantRedisClient(tenantConfig);

    const tenantState = createRedisState({
        client: {
            get: (key: string) => tenantRedisInstance.get(key),
            set: (key: string, val: string) => tenantRedisInstance.set(key, typeof val === 'string' ? val : JSON.stringify(val)),
            del: (key: string) => tenantRedisInstance.del(key),
            connect: async () => Promise.resolve(),
            on: (event: string, handler: Function) => { }
        } as any
    });

    const bot = new Chat({
        userName: `${tenantConfig.subdomain}_bot`,
        adapters: {
            telegram: createTelegramAdapter({
                secretToken: tenantConfig.telegramWebhookSecret,
                botToken: tenantConfig.telegramBotToken,
            }),
        },
        state: tenantState,
        concurrency: "queue",
        lockScope: "channel",
    });

    // Register handlers — inject tenant via clean closure mapping mechanics
    bot.onDirectMessage(async (thread, message) =>
        await handleAIResponse(thread, message, tenantConfig)
    );
    bot.onNewMention(async (thread, message) =>
        await handleAIResponse(thread, message, tenantConfig)
    );

    return bot;
}
