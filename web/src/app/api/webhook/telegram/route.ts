// app/api/webhook/telegram/route.ts
import { bot } from "@/lib/bot";   // ← Adjust path to where your bot.ts is
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    try {
        console.log("[Webhook] Received a new request");

        const body = await req.json();

        // This is the key line — it routes the update to your bot handlers
        // @ts-ignore - handleWebhook is private in some versions of the library
        await bot.adapters.telegram.handleWebhook(body, bot);

        console.log("[Webhook] Successfully processed update");
        return new Response("OK", { status: 200 });
    } catch (error: any) {
        console.error("[Webhook] Error processing update:", error?.message || error);
        return new Response("Error", { status: 500 });
    }
}