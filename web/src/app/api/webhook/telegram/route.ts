// app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { GoogleGenAI } from "@google/genai";

// Allow up to 60s for Gemini to respond and for us to send the reply
export const maxDuration = 60;

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

// ─── Send a message back to the user via Telegram Bot API ────────────────────
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

// ─── Core processing — runs inside waitUntil so Vercel stays alive ────────────
async function processUpdate(update: any): Promise<void> {
    const message = update.message ?? update.edited_message;
    if (!message?.text) {
        console.log("[Bot] No text in update, skipping.");
        return;
    }

    const chatId: number = message.chat.id;
    const userText: string = message.text;
    const userName: string = message.from?.username ?? message.from?.first_name ?? "user";

    console.log(`[Bot] Message from ${userName}: ${userText}`);

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! });

    console.log("[Bot] Calling Gemini...");
    const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: [{ role: "user", parts: [{ text: userText }] }],
    });

    const replyText =
        response.candidates?.[0]?.content?.parts?.[0]?.text ??
        "I couldn't generate a response.";

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

    // 2. Read body NOW (before returning the response — critical for Vercel)
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