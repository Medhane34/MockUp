// app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateText } from "ai";
import { detectIntent } from "@/lib/ai/intent";
import {
    SYSTEM_PROMPT,
    buildInfoPrompt,
    buildSalesPrompt,
    buildSupportPrompt
} from "@/lib/ai/prompts";
import { sanityTools } from "@/lib/ai/tools";
import { sendFormattedMessage } from "@/lib/telegram/format";
import { getProductList, getProductDetails, getFAQs } from "@/lib/sanity/queries";

// Allow up to 60s for AI to respond and for us to send the reply
export const maxDuration = 60;

// ─── Core AI processing — runs inside waitUntil ───────────────────────────────
async function processUpdate(update: any): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) {
        console.log("[Bot] No text in update, skipping.");
        return;
    }

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const telegramId = message.from?.id?.toString() || chatId.toString();
    const userName: string =
        message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot] Message from ${userName}: "${userText}"`);


    // === NEW: ONBOARDING CHECK (Early Exit) ===
    try {

        const { getBuyer, createOrUpdateBuyer } = await import("@/lib/sanity/buyer");
        const { handleOnboarding } = await import("@/lib/onboarding");

        let buyer = await getBuyer(telegramId);

        if (!buyer || buyer.onboardingStep !== "completed") {
            console.log(`[Onboarding] Checking onboarding for user ${telegramId}`);

            const onboardingResult = await handleOnboarding({
                post: async (content: any) => {
                    // Use your existing sendFormattedMessage
                    await sendFormattedMessage(chatId, typeof content === 'string' ? content : content.text);
                }
            }, message, buyer, telegramId);   // Pass adapted thread

            if (onboardingResult.handled) {
                console.log("[Onboarding] Handled successfully");
                return; // Stop normal flow
            }
        }
    } catch (onboardErr: any) {
        console.error("[Onboarding] Error during check:", onboardErr);
        // Continue with normal flow if onboarding fails
    }
    // 1. Intent Detection (Task 8)
    let intentResult;
    try {
        intentResult = await detectIntent(userText);
    } catch (err) {
        console.error("[Bot] Intent detection error:", err);
        intentResult = { intent: "unknown" as const, confidence: 0, params: undefined };
    }

    // 2. Fetch context based on intent (Task 7 / Task 9 / Task 11)
    let sanityContext = "";
    let prompt = "";

    try {
        if (intentResult.intent === "product_browse") {
            const products = await getProductList(intentResult.params?.category);
            sanityContext = products.length > 0
                ? JSON.stringify(products.map(p => ({
                    name: p.name,
                    slug: p.slug,
                    price: `${p.price} ETB`,
                    inStock: p.inStock ? "Yes" : "No",
                    category: p.category
                })))
                : "No products found in this category.";

            prompt = buildSalesPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "product_browse",
                sanityContext
            });
        }
        else if (intentResult.intent === "product_detail") {
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
                    features: product.features
                })
                : "Product details not found. Please check spelling or use the search tool.";

            prompt = buildSalesPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "product_detail",
                sanityContext
            });
        }
        else if (intentResult.intent === "faq") {
            const faqs = await getFAQs(intentResult.params?.faqCategory);
            sanityContext = faqs.length > 0
                ? JSON.stringify(faqs.map(f => ({
                    question: f.question,
                    answer: f.answer,
                    category: f.category
                })))
                : "No FAQs found.";

            prompt = buildInfoPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "faq",
                sanityContext
            });
        }
        else if (intentResult.intent === "order") {
            prompt = buildSupportPrompt({
                userName,
                userMessage: userText,
                detectedIntent: "order",
                sanityContext: "Order flow: Ask user for their contact details (name, phone, address) to place an order, or direct them to contact support at @aligoo_support."
            });
        }
        else if (intentResult.intent === "greeting") {
            prompt = `User message: "${userText}"
            
            Instructions: Welcome the user friendly. Introduce yourself as Aligoo Shopping Assistant. Mention that you can:
            1. Help them browse our products (categories: electronics, fashion, home, beauty, agriculture).
            2. Provide product details.
            3. Answer FAQs about shipping, returns, delivery, payments.
            4. Help place an order.
            
            Ask them how you can assist today.`;
        }
        else {
            // Task 11: Fallback System for unknown intent
            prompt = `User message: "${userText}"
            
            Instructions: This message does not match our typical queries. Be polite, say you didn't quite catch that, and friendly redirect them to ask about our product catalog, order status, FAQs (shipping, returns, pricing), or contact support at @aligoo_support.`;
        }
    } catch (err: any) {
        // Task 11: Tool/query fetch error fallback
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
        replyText = "⚠️ I'm sorry, I encountered an error while processing your request. Please try again later or contact our support team at @aligoo_support.";
    }

    console.log("[Bot] Gemini responded:", replyText.slice(0, 100));

    // 4. Send response to Telegram (Task 10)
    try {
        await sendFormattedMessage(chatId, replyText);
        console.log("[Bot] Reply sent to Telegram successfully.");
    } catch (err: any) {
        console.error("[Bot] Failed to send Telegram message:", err);
    }
}

// ─── Webhook handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    console.log("[Webhook] Received a new request");

    // 1. Validate Telegram's secret token header
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (secretHeader !== process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN) {
        console.warn("[Webhook] Invalid secret token — rejecting request");
        return new Response("Unauthorized", { status: 401 });
    }

    // 2. Read body NOW before returning — critical so the request stream
    //    isn't closed when Vercel sends the response.
    let update: any;
    try {
        update = await request.json();
    } catch {
        console.error("[Webhook] Failed to parse request body");
        return new Response("Bad Request", { status: 400 });
    }

    // 3. Hand off to waitUntil — Vercel stays alive until this resolves
    waitUntil(
        processUpdate(update).catch((err: any) => {
            console.error("[Bot] Unhandled error:", err?.message ?? err);
        })
    );

    // 4. Return 200 immediately so Telegram doesn't retry
    return new Response("OK", { status: 200 });
}