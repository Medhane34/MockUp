// lib/bot.ts (or wherever you have it)
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
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Checkpoint 1: Event for ${message.author?.userName || 'unknown'}`);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");
        console.log("[Bot] OPENAI_API_KEY present?", !!process.env.OPENAI_API_KEY);

        const { text } = await generateText({
            model: openai("gpt-5.4-mini"),
            messages: [{ role: "user", content: message.text! }],
            system: "You are a helpful AI Sales Agent.",

        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Posted");
    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        await thread.post("Sorry, I'm having issues right now. Try again.").catch(() => { });
    }
});