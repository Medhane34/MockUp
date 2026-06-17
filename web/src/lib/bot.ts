import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
// 1. Import 'gateway' from the core 'ai' package (Do NOT import @ai-sdk/google)
import { generateText, gateway } from "ai";

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

// === Handle Direct Messages (Private Chat) ===
bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// === Handle Mentions (in Groups) ===
bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// Shared AI logic
async function handleAIResponse(thread: any, message: any) {
    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");
        console.log("[Bot] Checkpoint 3: Routing through Vercel AI Gateway...");

        // 2. Route via Vercel's unified gateway endpoint
        const { text } = await generateText({
            model: gateway("google/gemini-2.5-flash-lite"), // Corrected architecture!
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
