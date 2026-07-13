// src/lib/telegram/callback.ts
import { createTenantRedisClient } from "@/lib/upstash";
import { createTenantWriteClient } from "@/sanity/client";
import { updateBuyerProfile } from "@/lib/sanity/buyer";
import type { TenantConfig } from "@/types/tenant";

interface TelegramCallbackQueryPayload {
    id: string;
    from: { id: number; first_name: string; username?: string };
    message?: { chat: { id: number }; message_id: number };
    data: string; // Contains your callbackValue key string (e.g., "budget_50k_100k")
}

/**
 * 🔒 STATELESS TELEGRAM CALLBACK GATEWAY
 * Handles background inline button interaction clicks securely across storage tiers.
 */
export async function handleTelegramCallbackQuery(
    tenant: TenantConfig,
    callbackQuery: TelegramCallbackQueryPayload
): Promise<void> {
    const chatId = callbackQuery.message?.chat.id.toString();
    const callbackData = callbackQuery.data;

    if (!chatId || !callbackData) return;

    console.log(`[Callback Core][${tenant.companyName}] Processing click turn for User: ${chatId} | Token: "${callbackData}"`);

    const tenantRedisInstance = createTenantRedisClient(tenant);
    const qualificationKey = `qualification:${chatId}`;

    // 1. Isolate the custom budget range string payload out of the callback value token
    let cleanBudgetSelectionString = callbackData;
    if (callbackData.startsWith("budget_")) {
        cleanBudgetSelectionString = callbackData.replace("budget_", "").replace("_", " ");
    }

    try {
        // 2. Load the existing profile context from your high-speed Upstash Redis list cache
        const existingCacheRaw = await tenantRedisInstance.get(qualificationKey);
        const existingProfile = existingCacheRaw
            ? (typeof existingCacheRaw === "string" ? JSON.parse(existingCacheRaw) : existingCacheRaw)
            : { timeline: "exploring", coreNeed: "Open Catalog Discovery", interests: [] };

        // Update properties state map safely
        const updatedProfile = {
            ...existingProfile,
            budgetRange: cleanBudgetSelectionString.toUpperCase(),
            lastQualifiedAt: new Date().toISOString()
        };

        const writeClient = createTenantWriteClient(tenant);

        // 3. 🚀 DISPATCH CONCURRENT SYNC OVER REDIS AND SANITY CLOUD LAKE
        await Promise.all([
            // Synchronize Redis Cache
            tenantRedisInstance.set(qualificationKey, JSON.stringify(updatedProfile)),

            // Update or create the persistent Buyer profile inside Sanity's database rows natively
            updateBuyerProfile(chatId, writeClient, {
                username: callbackQuery.from.username || "",
                firstName: callbackQuery.from.first_name,
                budgetRange: updatedProfile.budgetRange,
                qualificationStage: "partial"
            })
        ]);

        // 4. Send the mandatory termination acknowledge transaction receipt directly back to Telegram
        const cleanBotToken = tenant.telegramBotToken?.trim() || "";
        const answerCallbackUrl = `https://api.telegram.org/bot${cleanBotToken}/answerCallbackQuery`;

        await fetch(answerCallbackUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                callback_query_id: callbackQuery.id,
                text: `✅ Budget configured to: ${updatedProfile.budgetRange}`,
                show_alert: false
            })
        });

        console.log(`[Callback Core][${tenant.companyName}] State synced. Callback receipt answered successfully.`);

    } catch (err: any) {
        console.error(`❌ [Callback Exception][${tenant.companyName}] Pipeline crashed:`, err.message);
    }
}
