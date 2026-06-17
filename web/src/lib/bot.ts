import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { toAiMessages } from "chat/ai";
import { generateText, streamText, ToolLoopAgent } from "ai"; // Use ToolLoopAgent
import { createOpenAI } from '@ai-sdk/openai';
import { createRedisState } from "@chat-adapter/state-redis";


const openai = createOpenAI({
    apiKey: process.env.OPENAI_API_KEY, // This must match the name in Vercel
});
export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createRedisState(),
});

bot.onNewMention(async (thread, message) => {
    console.log("[Bot] Checkpoint 1: Event triggered");
    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed to thread");

        // Verify API Key exists
        if (!process.env.OPENAI_API_KEY) {
            console.error("[Bot] CRITICAL: OPENAI_API_KEY is missing in environment variables!");
            return;
        }

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        const { text } = await generateText({
            model: openai("gpt-4o"),
            messages: [{ role: 'user', content: message.text }],
            system: "You are a sales agent.",
        });

        console.log("[Bot] Checkpoint 4: AI Response received");

        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted to Telegram");
    } catch (error) {
        console.error("[Bot] ERROR inside onNewMention:", error);
    }
});