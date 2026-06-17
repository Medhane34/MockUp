import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
import { openai } from '@ai-sdk/openai';

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    // Auto-detects REDIS_URL or Vercel KV env vars (recommended)
    state: createRedisState(),

    concurrency: "queue",
    lockScope: "channel",
});

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Checkpoint 1: Event for ${message.author?.userName}`);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        const { text } = await generateText({
            model: openai("gpt-4o-mini"),
            messages: [{ role: "user", content: message.text }],
            system: `You are a professional AI Sales Agent. Be helpful, concise, and always move toward qualifying the lead.`,

        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);

        if (error?.code === "LOCK_FAILED") return;

        try {
            await thread.post("Sorry, I'm busy right now. Try again shortly.");
        } catch (_) { }
    }
});