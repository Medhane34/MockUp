/**
 * ============================================================================
 * 💳 ROUTE E SERVICE: CRYPTOGRAPHIC TRANSACTION CHECKOUT COMPILER
 * ============================================================================
 * 
 * DESIGN PATTERN:
 * Captures explicit purchase intents ("buy [sku]", "checkout now", "ሂሳብ ክፈል").
 * 
 * Bypasses the hosted Sanity MCP client completely to eliminate token burn
 * overhead, avoid data-fetching latency, and prevent pricing hallucinations.
 * It operates as a deterministic gate to compile and seed transaction tracking
 * tokens directly into Upstash Redis before rendering the secure checkout UI.
 */

import { generateCheckoutSessionToken } from "@/lib/checkout";
import { createTenantRedisClient } from "@/lib/upstash";
import { cleanMarkdownStream } from "@/lib/telegram/format";
import { streamText } from "ai";
import { createGateway } from '@ai-sdk/gateway';
import { BotServiceArgs } from "@/types/bot";
import { saveToHistory } from "@/lib/ai/conversation";

const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * 🟢 HANDLE ORDER TUNNEL GATING ENGINE
 * Processes high-intent checkout requests, builds unique transaction payloads,
 * and attaches your 1-Click Interactive Sandbox Checkout Inline Keyboards.
 */
export async function handleOrder({
    tenant,
    intentResult,
    thread,
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    console.log(`[Route E][${tenant.companyName}] Entering transactional order compiler funnel...`);

    // 1. Establish an isolated connection to this tenant's unique database cluster node
    const tenantRedisInstance = createTenantRedisClient(tenant);

    // 2. Extract and sanitize the targeted product SKU parameter code
    // Prioritize the structured parameter extracted by intentResult, falling back cleanly to user input
    const rawSku = intentResult.params?.slug || intentResult.params?.category || userText;
    const targetProductSku = rawSku.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9-_]/g, "");

    if (!targetProductSku || targetProductSku === "") {
        console.warn(`[Route E][${tenant.companyName}] Purchase triggered but target productSku could not be resolved.`);
        throw new Error("[Order Funnel Fail-Closed] Cannot initialize transaction metadata for an empty SKU reference.");
    }

    // 3. Generate a secure, un-guessable 32-character transaction tracking session token
    const sessionToken = generateCheckoutSessionToken(chatId, targetProductSku);

    // 4. Compile our unified multi-tenant session cache payload mapping object
    const sessionPayload = {
        sessionToken,
        tenantId: tenant.id,
        telegramId: chatId,
        productSku: targetProductSku,
        productName: intentResult.params?.category || targetProductSku.replace(/-/g, " "),
        status: "pending_payment",
        createdAt: new Date().toISOString()
    };

    // 🔄 SECURE SINGLE-VARIANT KEY LOCK: Keyed purely by your custom warehouse SKU!
    const sessionCacheKey = `checkout:session:${chatId}:${targetProductSku}`;

    try {
        // Seed the transaction reference into the merchant's isolated Redis node with an explicit 30-min TTL
        await tenantRedisInstance.set(sessionCacheKey, JSON.stringify(sessionPayload), { ex: 1800 });
        console.log(`[Route E][${tenant.companyName}] Secure session token seeded in cache: ${sessionToken}`);
    } catch (redisErr) {
        console.error(`[Route E][${tenant.companyName}] Critical Error: Failed to seed transaction tokens to Redis:`, redisErr);
    }

    // 5. Build your high-conversion, dual-row interactive checkout gateway matrix payload parameters
    const vercelHost = process.env.NEXT_PUBLIC_VERCEL_URL || process.env.VERCEL_URL || "localhost:3000";
    const protocol = vercelHost.includes("localhost") ? "http" : "https";

    // Point parameters natively onto your newly deployed production checkout sandbox window URL path string
    const sandboxUrl = `${protocol}://${vercelHost}/checkout-sandbox?sessionToken=${sessionToken}&tenantId=${tenant.id}&telegramId=${chatId}&productSku=${targetProductSku}&productName=${encodeURIComponent(sessionPayload.productName)}`;

    const isAmharic = intentResult.language === 'am';
    const formattedMessages = [
        { role: "user" as const, content: `Acknowledge checkout for item SKU: ${targetProductSku}` }
    ];
    // 6. Invoke streaming text via our Vercel AI Gateway provider to act as an enthusiastic closing agent
    const systemPrompt = `
You are an enthusiastic, high-velocity checkout coordinator for ${tenant.companyName}.
The customer has explicitly confirmed they want to purchase the product matching SKU: "${targetProductSku}".

CRITICAL SALES CLOSING INSTRUCTIONS:
- Enthusiastically confirm their selection.
- Explain clearly that their customized, secure 1-click mobile checkout gateway link is ready right below.
- Instruct them to tap the checkout button to complete their transaction safely.
- Do NOT output any HTML tags manually in your response copy.
- Respond accurately in the user's detected target language: ${isAmharic ? 'Amharic (በአማርኛ)' : 'English'}.
`.trim();

    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system: systemPrompt,
            messages: formattedMessages,
            providerOptions: {
                gateway: {
                    // 🔄 FIXED: Primary flagship model added to the front of the array list!
                    models: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    // 🔄 FIXED: Sets the precise sequence order for automated fallback switching
                    order: [
                        'google/gemini-2.5-flash',
                        'google/gemini-2.5-flash-lite',
                        'google/gemini-2.5-flash-preview-09-2025'
                    ],
                    // ⏱️ VERCEL TIMEOUT INCORPORATION: 
                    // Enforces a strict 4-second timeout limit per model invocation turn. 
                    // If gemini-2.5-flash hangs for 4000ms, Vercel instantly cuts it off 
                    // and routes the request to flash-lite, preserving execution limits!
                    timeout: 2500,
                    production: true
                },
            },
        });

        // 7. Inject the high-intent interactive checkout markup buttons row directly into the streaming transport
        const inlineKeyboardMarkup = {
            inline_keyboard: [
                // ROW 1: Direct action web checkout gateway redirect trigger link
                [
                    {
                        text: isAmharic ? "💳 ክፍያ ፈጽም (የሙከራ ገጽ)" : "💳 Proceed to Web Checkout",
                        url: sandboxUrl
                    }
                ],
                // ROW 2: Local polling listener button to re-evaluate Redis cache confirmations
                [
                    {
                        text: isAmharic ? "✅ ክፍያ አረጋግጫለሁ" : "✅ I've Confirmed Payment",
                        callback_data: `payment_poll_check` // Matches your exact working button click listener identifier!
                    }
                ]
            ]
        };

        // Pipe tokens and inject button row natively to your Telegram-aware thread post framework
        await thread.post(cleanMarkdownStream(result.textStream));

        const finalText = await result.text;
        // 3. ─── 🟢 TELEGRAM KEYBOARD INJECTION BIND ───
        // We use Telegram's native API endpoint to append the inline keyboard markup rows 
        // to the final message window securely once the stream is complete.
        // 🔄 FIX: Change line 152 to pull from the dynamic context properties cleanly:
        const cleanBotToken = (tenant as any).telegramBotToken?.trim().replace(/[\n\r\t]/g, "").replace(/^bot/i, "") || "";

        // Use the thread's native message context ID if exposed, or fallback to sending a clean attachment
        const telegramSendMessageUrl = `https://api.telegram.org/bot${cleanBotToken}/sendMessage`;

        try {
            await fetch(telegramSendMessageUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    chat_id: chatId,
                    text: isAmharic ? "👇 የክፍያ አማራጮች እነሆ፦" : "👇 Your secure checkout menu options are ready:",
                    reply_markup: inlineKeyboardMarkup
                })
            });
            console.log(`[Route E][${tenant.companyName}] Interactive matrix inline markup button rows attached successfully.`);
        } catch (tgErr: any) {
            console.error(`[Route E] Failed to attach Telegram inline keyboards layout:`, tgErr.message);
        }
        // Persist history asynchronously inside your parallelized transaction loop
        await Promise.all([
            saveToHistory(tenantRedisInstance, chatId, "user", userText),
            saveToHistory(tenantRedisInstance, chatId, "assistant", finalText),
        ]).catch((err) => {
            console.error(`[Route E][${tenant.companyName}] History persistence failed:`, err);
        });

    } catch (err: any) {
        console.error(`[Route E][${tenant.companyName}] Checkout compilation failure:`, err.message);
        throw err;
    }
}
