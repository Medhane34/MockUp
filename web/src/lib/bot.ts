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

        // === NEW: Check API Key ===
        console.log("[Bot] OPENAI_API_KEY present?", !!process.env.OPENAI_API_KEY);
        console.log("[Bot] OPENAI_API_KEY length:", process.env.OPENAI_API_KEY?.length || 0);

        if (!process.env.OPENAI_API_KEY) {
            console.error("[Bot] CRITICAL: OPENAI_API_KEY is missing or empty!");
            await thread.post("Configuration error: API key not found.");
            return;
        }

        console.log("[Bot] Checkpoint 3.1: Starting generateText...");

        const { text } = await generateText({
            model: openai("gpt-4o-mini"),
            messages: [{ role: "user", content: message.text }],
            system: `You are a professional AI Sales Agent. Be helpful, concise, and always guide toward sales.`,

        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] ERROR at Checkpoint 3+:", error?.message || error);
        console.error("[Bot] Full error:", JSON.stringify(error, null, 2));

        if (error?.code === "LOCK_FAILED") return;

        try {
            await thread.post("Sorry, I'm having trouble connecting to my brain right now. Please try again.");
        } catch (_) { }
    }
});