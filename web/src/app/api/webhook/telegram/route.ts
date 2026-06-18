// app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { generateText } from "ai";

// Allow up to 60s for AI to respond and for us to send the reply
export const maxDuration = 60;

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ─── Send a message back to Telegram ─────────────────────────────────────────
async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
    const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Telegram sendMessage failed: ${err}`);
    }
}

// ─── Core AI processing — runs inside waitUntil ───────────────────────────────
async function processUpdate(update: any): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) {
        console.log("[Bot] No text in update, skipping.");
        return;
    }

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const userName: string =
        message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot] Message from ${userName}: "${userText}"`);
    console.log("[Bot] Calling Gemini via Vercel AI Gateway...");

    // ✅ Vercel AI Gateway — model string format: 'provider/model-name'
    // AI_GATEWAY_API_KEY is read automatically from the environment
    const { text: replyText } = await generateText({
        model: "google/gemini-2.0-flash",
        prompt: userText,
    });

    console.log("[Bot] Gemini responded:", replyText.slice(0, 100));

    await sendTelegramMessage(chatId, replyText);
    console.log("[Bot] Reply sent to Telegram.");
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