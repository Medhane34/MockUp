import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { toAiMessages } from "chat/ai";
import { generateText, streamText, ToolLoopAgent } from "ai"; // Use ToolLoopAgent
import { createOpenAI } from '@ai-sdk/openai';

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
    state: createMemoryState(),
});

bot.onNewMention(async (thread, message) => {
    try {
        console.log("[Bot] onNewMention triggered for:", message.text);
        await thread.subscribe();

        // Ensure generateText and openai are imported at the top of the file
        const { text } = await generateText({
            model: openai("gpt-4o"),
            messages: [{ role: 'user', content: message.text }], // Simplify for testing
            system: "You are a sales agent.",
        });

        await thread.post(text);
    } catch (error) {
        console.error("[Bot] ERROR inside onNewMention:", error);
    }
});