import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { generateText } from "ai";
import { openai } from '@ai-sdk/openai';

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createMemoryState(),

    // === CONCURRENCY FIXES (Critical for Telegram) ===
    concurrency: "queue",           // Better than default "drop"
    lockScope: "channel",           // Recommended for Telegram (groups + DMs)
    // onLockConflict: "force",     // Uncomment if you want aggressive processing
});

bot.onNewMention(async (thread, message) => {
    console.log("[Bot] Checkpoint 1: Event triggered for", message.author.userName);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        const { text } = await generateText({
            model: openai("gpt-5.4-mini"),   // Use mini for faster/cheaper testing
            messages: [{ role: "user", content: message.text }],
            system: `You are a helpful AI Sales Agent. Be concise and professional.`,
        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        console.error("[Bot] Full error:", error);

        if (error?.code === "LOCK_FAILED") {
            console.log("[Bot] Lock conflict - skipping gracefully");
            return; // Don't spam user
        }

        // Fallback message
        try {
            await thread.post("Sorry, I'm busy right now. Please try again in a moment.");
        } catch (_) { }
    }
});