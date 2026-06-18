// lib/bot.ts
// The Chat SDK bot instance is kept here for future use (e.g. state management,
// multi-adapter support). AI processing is handled directly in the route handler.
import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";

export const bot = new Chat({
    userName: "aligoo_agent_bot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});