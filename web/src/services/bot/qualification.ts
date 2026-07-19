/**
 * ============================================================================
 * 📋 ROUTE F SERVICE: BANT SURVEY ONBOARDING QUALIFICATION ENGINE
 * ============================================================================
 * 
 * DESIGN PATTERN:
 * Captures early-stage exploration intents ("help me choose", "show choices", "/start").
 * 
 * Bypasses the hosted Sanity MCP client completely to minimize token expenses and
 * eliminate database network latency. It prints your bilingually supported 
 * multi-choice survey button arrays natively to qualify customer budgets and timelines.
 */

import { saveToHistory } from "@/lib/ai/conversation";
import { createTenantRedisClient } from "@/lib/upstash";
import { BotServiceArgs } from "@/types/bot";


/**
 * 🟢 HANDLE BUYER FUNNEL QUALIFICATION SURVEY
 */
export async function handleQualification({
    tenant,
    intentResult,
    thread,
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    console.log(`[Route F][${tenant.companyName}] Launching interactive BANT qualification matrix...`);

    // Tenant-isolated Upstash Redis REST client (stateless HTTP — no connect() needed)
    const tenantRedisInstance = createTenantRedisClient(tenant);

    const isAmharic = intentResult.language === 'am';

    // 1. Compile localized prompt text variants natively
    const surveyNoticeText = isAmharic
        ? `👋 <b>እንኳን ደህና መጡ ወደ ${tenant.companyName}!</b>\n\nለእርስዎ የሚስማማውን ምርጥ ዕቃ ለመምረጥ እባክዎ መጀመሪያ <b>የምርት በጀትዎን</b> ከታች ካሉት አማራጮች ይምረጡ፦`
        : `👋 <b>Welcome to ${tenant.companyName}!</b>\n\nTo help us recommend the absolute best matches from our catalog, please select your preferred <b>Purchase Budget Range</b> from the options below:`;

    // 2. Build your high-conversion inline survey keyboard arrays 
    // These match your existing button markups exactly to save state profiles to Redis!
    const qualificationSurveyMarkup = {
        inline_keyboard: [
            [
                { text: isAmharic ? "💵 ከ 20k - 50k ETB" : "💵 20k - 50k ETB", callback_data: `budget_20k_50k` },
                { text: isAmharic ? "💵 ከ 50k - 100k ETB" : "💵 50k - 100k ETB", callback_data: `budget_50k_100k` }
            ],
            [
                { text: isAmharic ? "💵 ከ 100k - 200k ETB" : "💵 100k - 200k ETB", callback_data: `budget_100k_200k` },
                { text: isAmharic ? "⚡ ከፍተኛ ምርት (Premium)" : "⚡ Premium Tier", callback_data: `budget_premium` }
            ],
            [
                { text: isAmharic ? "❌ አሁን ይቅርብኝ" : "❌ Cancel Survey", callback_data: `unknown` }
            ]
        ]
    };

    try {
        // 3. Dispatch the survey buttons instantly over the multi-platform framework channel
        // Passed as a single argument string with accompanying markup options configurations
        // 3. 🔄 FIXED: Dispatch text parameter cleanly with EXACTLY 1 argument to eliminate compilation crash
        await thread.post(stripHtmlTags(surveyNoticeText));

        // 4. ─── 🟢 TELEGRAM SURVEY KEYBOARD INJECTION BIND ───
        // Pass the structural button markup parameters via a direct backend API payload fetch
        const cleanBotToken = (tenant as any).telegramBotToken?.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "") || "";
        const telegramSendMessageUrl = `https://api.telegram.org/bot${cleanBotToken}/sendMessage`;

        try {
            await fetch(telegramSendMessageUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: isAmharic ? "👇 በጀትዎን እዚህ ይምረጡ፦" : "👇 Select your target range here:",
                    reply_markup: qualificationSurveyMarkup
                })
            });
            console.log(`[Route F][${tenant.companyName}] Onboarding survey keyboard menus dispatched successfully.`);
        } catch (tgErr: any) {
            console.error(`[Route F] Failed to attach Telegram survey inline keyboard:`, tgErr.message);
        }
        // 4. Commit conversational history parameter states inside your parallelized transaction loop
        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", stripHtmlTags(surveyNoticeText)),
        ]).catch((err) => {
            console.error(`[Route F][${tenant.companyName}] History logging failed:`, err);
        });

    } catch (err: any) {
        console.error(`[Route F][${tenant.companyName}] Qualification workflow failure:`, err.message);
        throw err;
    }
}

/**
 * Clean HTML helper utility to strip layout tags before saving text strings to history streams
 */
function stripHtmlTags(text: string): string {
    return text.replace(/<\/?[^>]+(>|$)/g, "");
}
