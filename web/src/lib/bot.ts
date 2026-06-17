import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN,
        }),
    },
    state: createMemoryState(),
});
// Step A: Triggered the first time a user talks to the bot or mentions it in a group
bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] First mention received: ${message.text}`);

    // CRITICAL: You must subscribe to the thread to receive follow-up messages!
    await thread.subscribe();
    await thread.post(`Hello! I am listening to this thread now. You said: ${message.text}`);
});

// Step B: Triggered for every message sent inside an already subscribed thread
bot.onSubscribedMessage(async (thread, message) => {
    console.log(`[Bot] Subscribed follow-up message: ${message.text}`);
    await thread.post(`You said: ${message.text}`);
});