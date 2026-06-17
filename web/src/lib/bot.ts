import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
import { google } from '@ai-sdk/google';   // ← Gemini provider

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
    console.log(`[Bot] Checkpoint 1: Event for ${message.author?.userName}`);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling Gemini...");
        console.log("[Bot] GEMINI_API_KEY present?", !!process.env.GEMINI_API_KEY?.trim());

        if (!process.env.GEMINI_API_KEY) {
            console.error("[Bot] CRITICAL: GEMINI_API_KEY is missing!");
            await thread.post("Configuration error. API key not set.").catch(() => { });
            return;
        }

        const { text } = await generateText({
            model: google('gemini-2.0-flash-exp'),     // Fast & free-friendly (or gemini-1.5-flash)
            messages: [{ role: "user", content: message.text! }],
            system: `You are a professional AI Sales Agent.
               Be helpful, concise, and always try to understand the user's needs and guide them toward products/services.`,

        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        console.error("[Bot] Full error:", error);

        try {
            await thread.post("Sorry, I'm having trouble right now. Please try again shortly.");
        } catch (_) { }
    }
});