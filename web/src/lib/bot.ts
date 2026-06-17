import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";   // ← Changed
import { generateText } from "ai";
import { openai } from '@ai-sdk/openai';

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createRedisState({
        url: process.env.KV_REST_API_URL || process.env.REDIS_URL!,   // Supports both
    }),

    // Concurrency settings (critical for serverless)
    concurrency: "queue",
    lockScope: "channel",
});

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Checkpoint 1: Event triggered for user ${message.author.userName}`);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        const { text } = await generateText({
            model: openai("gpt-4o-mini"),   // Fast & cheap for testing
            messages: [{ role: "user", content: message.text }],
            system: `You are a professional AI Sales Agent. 
               Be helpful, concise, and always guide the user toward product interest.`,

        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted to Telegram");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        console.error("[Bot] Full error:", error);

        if (error?.code === "LOCK_FAILED") {
            console.log("[Bot] Lock conflict - skipping");
            return;
        }

        try {
            await thread.post("Sorry, I'm experiencing high load. Please try again shortly.");
        } catch (_) { }
    }
});