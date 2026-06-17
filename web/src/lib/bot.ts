import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
// 1. Import the default native google provider
import { google } from '@ai-sdk/google';

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

// === Handle Direct Messages ===
bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// === Handle Mentions ===
bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// Shared AI logic
async function handleAIResponse(thread: any, message: any) {
    try {
        console.log("Before subscribe");
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");
        console.log(
            "[Bot] API Key Exists:",
            !!process.env.GOOGLE_GENERATIVE_AI_API_KEY
        );// 2. The native SDK automatically reads process.env.GOOGLE_GENERATIVE_AI_API_KEY
        console.log("[Bot] Testing Gemini");

        const result = await Promise.race([
            generateText({
                model: google("gemini-2.5-flash"),
                prompt: "Hello",
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Gemini timeout")), 10000)
            ),
        ]);

        console.log("Gemini finished");


        await thread.post((result as any).text);

        console.log("[Bot] Posted response");


    } catch (error: any) {
        console.error("[Bot] EXPLICIT ERROR CAUGHT:", error?.message || error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}
