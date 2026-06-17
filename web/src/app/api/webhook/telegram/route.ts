// app/api/webhook/telegram/route.ts
import { bot } from "@/lib/bot";   // ← Change path if your bot.ts is elsewhere (e.g. "@/bot")
import { NextRequest } from "next/server";

export async function POST(request: NextRequest) {
    try {
        console.log("[Webhook] Received a new request");

        // This is the CORRECT way for current Chat SDK + Telegram adapter
        await bot.webhooks.telegram(request);

        console.log("[Webhook] Successfully processed update");
        return new Response("OK", { status: 200 });
    } catch (error: any) {
        console.error("[Webhook] Error:", error?.message || error);
        return new Response("Error", { status: 500 });
    }
}