// src/lib/bot.ts
import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

export const bot = new Chat({
    userName: "aligoo_agent_bot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN!,
        }),
    },
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});

// Use the state adapter directly (more reliable)
const stateAdapter = createRedisState();

// Helper: Get conversation history
async function getConversationHistory(threadId: string, limit = 8) {
    try {
        const key = `history:${threadId}`;
        const history = await stateAdapter.getList?.(key) || [];
        return Array.isArray(history) ? history.slice(-limit) : [];
    } catch (e) {
        console.error("[Memory] Failed to load history:", e);
        return [];
    }
}

// Helper: Save message to history
async function saveToHistory(threadId: string, role: "user" | "assistant", content: string) {
    try {
        const key = `history:${threadId}`;
        await stateAdapter.appendToList?.(key, {
            role,
            content: content.slice(0, 600),
            timestamp: Date.now(),
        });
    } catch (e) {
        console.error("[Memory] Failed to save history:", e);
    }
}

// Shared AI logic with Memory
async function handleAIResponse(thread: any, message: any) {
    const threadId = thread.id || message.chat?.id || message.from?.id || message.author?.id || "unknown";

    try {
        console.log(`[Bot] Processing message for thread ${threadId}`);
        await thread.subscribe();

        const userText = typeof message.text === "string"
            ? message.text
            : (message.content?.text ?? "Hello");

        console.log("[Bot] User message:", userText);

        // Load conversation history
        const history = await getConversationHistory(threadId, 8);
        console.log(`[Bot] Loaded ${history.length} previous messages from memory`);

        // Build message history for Gemini
        const contents = [
            ...history.map((msg: any) => ({
                role: msg.role,
                parts: [{ text: msg.content }]
            })),
            { role: "user", parts: [{ text: userText }] }
        ];

        console.log("[Bot] Calling Gemini with context...");

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-lite",
            contents,
        });

        const replyText = response.candidates?.[0]?.content?.parts?.[0]?.text
            ?? "I couldn't generate a response right now.";

        console.log("[Bot] Gemini responded:", replyText.slice(0, 80));

        // Save to memory
        await saveToHistory(threadId, "user", userText);
        await saveToHistory(threadId, "assistant", replyText);

        await thread.post(replyText);
        console.log("[Bot] Reply sent to Telegram.");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message ?? error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}

// Register handlers
bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName || message.author?.userId}`);
    await handleAIResponse(thread, message);
});

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName || message.author?.userName}`);
    await handleAIResponse(thread, message);
});