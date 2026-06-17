import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { generateText } from "ai";

// OpenAI Provider
import { openai } from '@ai-sdk/openai';

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createMemoryState(),
});

bot.onNewMention(async (thread, message) => {
    console.log("[Bot] Checkpoint 1: Event triggered");
    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed to thread");

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        const { text } = await generateText({
            model: openai('gpt-4o'),           // Best current balance (fast + smart)
            // model: openai('gpt-4o-mini'),   // Cheaper & faster for testing
            messages: [{ role: 'user', content: message.text }],
            system: `You are a professional AI Sales Agent.
               Be helpful, concise, and always try to qualify the lead and move the conversation toward a sale.`,
        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted to Telegram");

    } catch (error: any) {
        console.error("[Bot] ERROR inside onNewMention:", error?.message || error);
        console.error("[Bot] Full error object:", error);

        // Graceful fallback message to user
        await thread.post("Sorry, I'm having trouble right now. Can you please try again?");
    }
});