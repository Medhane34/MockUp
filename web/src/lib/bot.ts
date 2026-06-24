// src/lib/bot.ts
import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { GoogleGenAI } from "@google/genai";

// We'll create this next
import { getBuyer, updateBuyerInteraction } from "./sanity/buyer";
import { handleOnboarding } from "./onboarding";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY! });

export const bot = new Chat({
    userName: "aligoo_agent_bot",
    adapters: { telegram: createTelegramAdapter({ secretToken: process.env.TELEGRAM_WEBHOOK_SECRET_TOKEN! }) },
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});

const stateAdapter = createRedisState();

// === Memory Helpers (Unchanged) ===
// Helper: Get conversation history
async function getConversationHistory(threadId: string, limit = 8) {
    try {
        const key = `history:${threadId}`;
        const history = await stateAdapter.getList?.(key);

        // Safe guard against void/undefined/null
        if (!history || !Array.isArray(history)) {
            return [];
        }

        return history.slice(-limit);
    } catch (e) {
        console.error("[Memory] Failed to load history:", e);
        return [];
    }
} { /* ... same as before */ }
async function saveToHistory(threadId: string, role: "user" | "assistant", content: string) { /* ... same as before */ }

// Main Handler
// Shared AI logic with Memory + Onboarding
async function handleAIResponse(thread: any, message: any) {
    const telegramId = message.from?.id?.toString() || message.chat?.id?.toString() || "unknown";
    const threadId = thread.id || telegramId;

    try {
        console.log(`[Bot] Processing message for user ${telegramId}`);

        await thread.subscribe();

        const userText = typeof message.text === "string"
            ? message.text
            : (message.content?.text ?? "Hello");

        console.log("[Bot] User message:", userText);

        // === 2. Normal Conversation Flow (After Onboarding) ===
        console.log(`[Bot] User ${telegramId} is fully onboarded. Proceeding with normal response.`);

        const history = await getConversationHistory(threadId, 8);

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
            ?? "Sorry, I couldn't generate a response right now.";

        console.log("[Bot] Gemini responded:", replyText.slice(0, 80));

        // Save to memory
        await saveToHistory(threadId, "user", userText);
        await saveToHistory(threadId, "assistant", replyText);

        await thread.post(replyText);


    } catch (error: any) {
        console.error("[Bot] ERROR in handleAIResponse:", error?.message ?? error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}

// Register handlers
bot.onDirectMessage(async (thread, message) => await handleAIResponse(thread, message));
bot.onNewMention(async (thread, message) => await handleAIResponse(thread, message));