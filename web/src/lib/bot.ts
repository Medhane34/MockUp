import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createMemoryState } from "@chat-adapter/state-memory";

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter(),
    },
    state: createMemoryState(),
});
bot.onNewMention(async (thread: { post: (arg0: string) => any; }, message: { text: any; }) => {
    console.log(`[Bot] Mentioned with message: ${message.text}`);
    await thread.post(`You said: ${message.text}`);
});