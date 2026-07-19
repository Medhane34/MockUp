// src/app/api/webhook/telegram/failure/route.ts
import { sendFormattedMessage } from "@/lib/telegram/format";
import { NextRequest, NextResponse } from "next/server";

/**
 * 🚨 QSTASH DEAD LETTER QUEUE (DLQ) PUSH BACKUP CONTROLLER
 * Triggered automatically by QStash when all transaction execution attempts fail.
 */
export async function POST(request: NextRequest) {
    console.log("🚨 [DLQ Callback] QStash retry exhaustion event captured! Dispatching user notification...");

    try {
        const rawBodyText = await request.text();
        const failurePayload = JSON.parse(rawBodyText);

        // QStash wraps your original transaction payload inside the 'body' property string container
        // We unpack it natively using base64 decoding parameters if wrapped, or direct object parsing
        const originalPayload = typeof failurePayload.body === "string"
            ? JSON.parse(Buffer.from(failurePayload.body, "base64").toString("utf8"))
            : failurePayload.body;

        const { update, tenant } = originalPayload || {};
        const message = update?.message ?? update?.edited_message ?? update?.callback_query?.message;
        const chatId = message?.chat?.id;

        if (!chatId || !tenant?.telegramBotToken) {
            console.error("[DLQ Callback] Critical Error: Missing vital communication parameter keys inside payload context.");
            return new Response("Missing tracing markers", { status: 200 }); // Always acknowledge QStash with a 200
        }

        const userLanguage = update?.message?.from?.language_code || "en";
        const isAmharic = userLanguage === "am";

        // ─── 🌍 localized USER ERROR FEEDBACK ───
        const systemFailureMessageText = isAmharic
            ? `⚠️ <b>የአገልጋይ መቆራረጥ አጋጥሟል</b>\n\nይቅርታ፣ ጥያቄዎን በአሁኑ ወቅት ማጠናቀቅ አልቻልንም። የቴክኒክ ቡድናችን የሲስተም መቆራረጡን እያስተካከለ ይገኛል። እባክዎ ከጥቂት ደቂቃዎች በኋላ እንደገና ይሞክሩ። ለቀጥታ እገዛ እዚህ ያግኙን፦ ${tenant.supportHandle || ""}`
            : `⚠️ <b>Temporary System Congestion</b>\n\nI'm sorry, I encountered an unexpected congestion delay while searching our data catalogs right now. Our engineering team has been alerted. Please send your message or command request again in a few moments. For direct help, reach out to us at ${tenant.supportHandle || ""}`;

        console.log(`[DLQ Callback][${tenant.companyName}] Pushing localized system error alerts directly to user chat thread: ${chatId}`);

        // Dispatch the final error message frame seamlessly
        await sendFormattedMessage(tenant.telegramBotToken, chatId, systemFailureMessageText, "HTML", null);

        return NextResponse.json({ processed: true }, { status: 200 });

    } catch (err: any) {
        console.error("[DLQ Callback Master Crash] Failed to route failure alert:", err.message);
        return NextResponse.json({ error: err.message }, { status: 200 }); // Always ack 200 to prevent DLQ routing loops
    }
}
