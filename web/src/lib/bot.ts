import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";
import { toAiMessages } from "chat/ai";
import { streamText, ToolLoopAgent } from "ai"; // Use ToolLoopAgent
import { openai } from "@ai-sdk/openai"; // Recommended provider import

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,
        }),
    },
    state: createMemoryState(),
});

bot.onNewMention(async (thread, message) => {
    await thread.subscribe();

    // 1. Resolve the AsyncIterable to an Array
    const messagesArray = [];
    for await (const msg of thread.messages) {
        messagesArray.push(msg);
    }

    // 2. Convert to AI SDK format
    const aiMessages = await toAiMessages(messagesArray);

    // 3. Use streamText (Standard, reliable, replaces ToolLoopAgent)
    const result = streamText({
        model: openai("gpt-4o"),
        messages: aiMessages,
        system: "You are a specialized sales agent for our agency. Guide the user through the sales process.",
    });

    // 4. Stream response back to the Telegram thread
    for await (const textPart of result.textStream) {
        await thread.post(textPart);
    }
});