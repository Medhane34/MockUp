import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
// 1. Import createGateway to explicitly pass credentials
import { createGateway } from "@ai-sdk/gateway";

// 2. Instantiate the gateway explicitly with your environment configuration
const aiGateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY,
});

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});

bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// Shared AI logic
async function handleAIResponse(thread: any, message: any) {
    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        // Diagnostic log to confirm the string exists before calling the SDK
        const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_AI_GATEWAY_API_KEY;
        console.log(`[Bot] Checkpoint 3: Key Length = ${gatewayKey ? gatewayKey.length : 0}. Querying Gateway...`);

        // 3. Call your instantiated gateway instance directly
        const { text } = await generateText({
            model: aiGateway("google/gemini-2.5-flash-lite"),
            messages: [{ role: "user", content: message.text! }],
            system: `You are a professional AI Sales Agent. Be helpful, concise, and sales-oriented.`,
        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] EXPLICIT ERROR CAUGHT:", error?.message || error);
        console.error("[Bot] Error Details:", JSON.stringify(error, null, 2));
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}
