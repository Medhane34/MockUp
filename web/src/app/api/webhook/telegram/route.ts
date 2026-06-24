// app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateText } from "ai";
import { detectIntent } from "@/lib/ai/intent";
import {
    SYSTEM_PROMPT,
    buildInfoPrompt,
    buildSalesPrompt,
    buildSupportPrompt,
} from "@/lib/ai/prompts";
import { sanityTools } from "@/lib/ai/tools";
import { sendFormattedMessage } from "@/lib/telegram/format";
import { getProductList, getProductDetails, getFAQs } from "@/lib/sanity/queries";

// Allow up to 60s for AI to respond
export const maxDuration = 60;

// ─── Webhook handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    console.log("[Webhook] Received a new request");

    // 1. Validate secret token
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
        console.warn("[Webhook] Invalid secret token — rejecting request");
        return new Response("Unauthorized", { status: 401 });
    }

    // 2. Parse body
    let update: any;
    try {
        update = await request.json();
    } catch {
        console.error("[Webhook] Failed to parse request body");
        return new Response("Bad Request", { status: 400 });
    }

    // 3. Determine update type:
    //    - update.message / update.edited_message → regular text/contact message
    //    - update.callback_query → inline button tap (e.g. "Agree", language, interests)
    const message = update.message ?? update.edited_message ?? null;
    const callbackQuery = update.callback_query ?? null;

    if (!message && !callbackQuery) {
        // Nothing actionable (channel posts, etc.)
        return new Response("OK", { status: 200 });
    }

    // Extract chatId and telegramId from whichever update type we got
    const chatId: number =
        message?.chat?.id ?? callbackQuery?.message?.chat?.id ?? 0;
    const telegramId: string =
        (message?.from?.id ?? callbackQuery?.from?.id)?.toString() ??
        chatId.toString();

    if (!chatId) {
        console.warn("[Webhook] Could not determine chatId, skipping.");
        return new Response("OK", { status: 200 });
    }

    // 4. Onboarding gate — check Sanity for completed status
    const isOnboarded = await checkOnboardingComplete(telegramId);

    if (!isOnboarded) {
        console.log(`[Onboarding Gate] User ${telegramId} not completed onboarding`);
        // Pass the full update (not just message) so onboarding.ts can see callback_query
        await handleOnboardingUpdate(update, chatId, telegramId);
        return new Response("OK", { status: 200 });
    }

    // 5. Fully onboarded — run AI flow asynchronously
    console.log(`[Bot] User ${telegramId} is onboarded → Running full AI flow`);
    waitUntil(
        processUpdate(update).catch((err: any) => {
            console.error("[Bot] Unhandled error:", err?.message ?? err);
        })
    );

    return new Response("OK", { status: 200 });
}

// ─── Core AI processing (runs inside waitUntil) ───────────────────────────────
async function processUpdate(update: any): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) {
        console.log("[Bot] No text in update, skipping AI flow.");
        return;
    }

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const telegramId = message.from?.id?.toString() || chatId.toString();
    const userName: string =
        message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot] Message from ${userName}: "${userText}"`);

    // 1. Intent Detection
    let intentResult;
    try {
        intentResult = await detectIntent(userText);
    } catch (err) {
        console.error("[Bot] Intent detection error:", err);
        intentResult = { intent: "unknown" as const, confidence: 0, params: undefined };
    }

    // 2. Fetch context and build prompt based on intent
    let sanityContext = "";
    let prompt = "";

    try {
        if (intentResult.intent === "product_browse") {
            const products = await getProductList(intentResult.params?.category);
            sanityContext =
                products.length > 0
                    ? JSON.stringify(
                        products.map((p) => ({
                            name: p.name,
                            slug: p.slug,
                            price: `${p.price} ETB`,
                            inStock: p.inStock ? "Yes" : "No",
                            category: p.category,
                        }))
                    )
                    : "No products found in this category.";

            prompt = buildSalesPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "product_browse",
                sanityContext,
            });
        } else if (intentResult.intent === "product_detail") {
            let product = null;
            if (intentResult.params?.slug) {
                product = await getProductDetails(intentResult.params.slug);
            }
            sanityContext = product
                ? JSON.stringify({
                    name: product.name,
                    slug: product.slug,
                    price: `${product.price} ETB`,
                    inStock: product.inStock ? "Yes" : "No",
                    stockQuantity: product.stockQuantity,
                    description: product.description,
                    features: product.features,
                })
                : "Product details not found. Please check spelling or use the search tool.";

            prompt = buildSalesPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "product_detail",
                sanityContext,
            });
        } else if (intentResult.intent === "faq") {
            const faqs = await getFAQs(intentResult.params?.faqCategory);
            sanityContext =
                faqs.length > 0
                    ? JSON.stringify(
                        faqs.map((f) => ({
                            question: f.question,
                            answer: f.answer,
                            category: f.category,
                        }))
                    )
                    : "No FAQs found.";

            prompt = buildInfoPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "faq",
                sanityContext,
            });
        } else if (intentResult.intent === "order") {
            prompt = buildSupportPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "order",
                sanityContext:
                    "Order flow: Ask user for their contact details (name, phone, address) to place an order, or direct them to contact support at @aligoo_support.",
            });
        } else if (intentResult.intent === "greeting") {
            prompt = `User message: "${userText}"
            
            Instructions: Welcome the user warmly. Introduce yourself as Aligoo Shopping Assistant. Mention that you can:
            1. Help them browse products (categories: electronics, fashion, home, beauty, agriculture).
            2. Provide product details.
            3. Answer FAQs about shipping, returns, delivery, payments.
            4. Help place an order.
            
            Ask them how you can assist today.`;
        } else {
            // Fallback for unknown intent
            prompt = `User message: "${userText}"
            
            Instructions: This message does not match typical queries. Be polite, say you didn't quite catch that, and redirect them to ask about our product catalog, order status, FAQs (shipping, returns, pricing), or contact support at @aligoo_support.`;
        }
    } catch (err: any) {
        console.error("[Bot] Context retrieval failed:", err);
        sanityContext = "Error retrieving details from catalog database.";
        prompt = `User message: "${userText}"
        
        Instructions: Apologize that we had trouble fetching catalog details right now. Suggest they contact @aligoo_support or try again in a moment.`;
    }

    console.log("[Bot] Calling Gemini with prompt context...");

    let replyText = "";
    try {
        const result = await generateText({
            model: "google/gemini-2.5-flash-lite",
            system: SYSTEM_PROMPT,
            prompt: prompt,
            tools: sanityTools,
            maxSteps: 5,
        } as any);
        replyText = result.text;
    } catch (err: any) {
        console.error("[Bot] Gemini API execution failed:", err);
        replyText =
            "⚠️ I'm sorry, I encountered an error while processing your request. Please try again later or contact our support team at @aligoo_support.";
    }

    console.log("[Bot] Gemini responded:", replyText.slice(0, 100));

    // 3. Send response to Telegram
    try {
        await sendFormattedMessage(chatId, replyText, "Markdown");
        console.log("[Bot] Reply sent to Telegram successfully.");
    } catch (err: any) {
        console.error("[Bot] Failed to send Telegram message:", err);
    }
}

// ─── Onboarding Helpers ───────────────────────────────────────────────────────

async function checkOnboardingComplete(telegramId: string): Promise<boolean> {
    try {
        const { getBuyer } = await import("@/lib/sanity/buyer");
        const buyer = await getBuyer(telegramId);
        return !!(buyer && buyer.onboardingStep === "completed");
    } catch (e) {
        console.error("[Onboarding] Check failed:", e);
        return false;
    }
}

/**
 * Handles the onboarding flow for users who haven't completed it yet.
 * Passes the full Telegram `update` object so onboarding.ts can inspect
 * both update.message and update.callback_query at the root level.
 */
async function handleOnboardingUpdate(
    update: any,
    chatId: number,
    telegramId: string
) {
    try {
        const { handleOnboarding } = await import("@/lib/onboarding");
        const { getBuyer } = await import("@/lib/sanity/buyer");

        const buyer = await getBuyer(telegramId);
        // Pass the full update object — onboarding.ts reads update.callback_query directly
        const result = await handleOnboarding(null, update, buyer, telegramId);

        if (result.handled && result.response) {
            await sendFormattedMessage(
                chatId,
                result.response.text,
                "Markdown",
                result.response.replyMarkup ?? null
            );
        }
    } catch (e) {
        console.error("[Onboarding Handler] Failed:", e);
        // Safe fallback so user isn't left hanging
        await sendFormattedMessage(
            chatId,
            "Welcome to Aligoo! Type /start to begin.",
            null
        );
    }
}