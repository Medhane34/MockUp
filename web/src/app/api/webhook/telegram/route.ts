// app/api/webhook/telegram/route.ts
import { bot } from "@/lib/bot";
import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

// Give Vercel up to 60 seconds to complete the async AI work
export const maxDuration = 60;

export async function POST(request: NextRequest) {
    console.log("[Webhook] Received a new request");

    // Clone the request body BEFORE passing to the SDK,
    // so we can still read it if needed for debugging.
    const processingPromise = bot.webhooks.telegram(request).catch((error: any) => {
        console.error("[Webhook] Bot processing error:", error?.message ?? error);
    });

    // ✅ waitUntil keeps the Vercel function alive until the AI response
    // is generated and sent — even after we've returned 200 OK to Telegram.
    waitUntil(processingPromise);

    // Telegram requires a fast 200 OK — return immediately.
    return new Response("OK", { status: 200 });
}