import { bot } from "@/lib/bot";

export async function POST(request: Request): Promise<Response> {
    console.log("[Webhook] Received a new request");
    try {
        const response = await bot.webhooks.telegram(request);
        console.log("[Webhook] Successfully processed update");
        return response;
    } catch (error) {
        console.error("[Webhook] Error processing update:", error);
        return new Response("Error", { status: 500 });
    }
}
