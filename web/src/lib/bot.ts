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
    await thread.subscribe();

    // 1. Convert history
    const messagesArray = [];
    for await (const msg of thread.messages) {
        messagesArray.push(msg);
    }
    const aiMessages = await toAiMessages(messagesArray);

    // 2. Generate full response (not streaming loop)
    const { text } = await generateText({
        model: openai("gpt-4o"),
        messages: aiMessages,
        system: "You are a specialized sales agent for our agency...",
    });

    // 3. Post the single, complete response
    await thread.post(text);
});