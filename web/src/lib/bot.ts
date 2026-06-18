import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { GoogleGenAI } from "@google/genai";

// ✅ Use Google GenAI SDK directly (free, no Vercel AI Gateway required)
const ai = new GoogleGenAI({
    apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY!,
});

export const bot = new Chat({
    userName: "mybot",
    adapters: {
        telegram: createTelegramAdapter({
            secretToken: process.env.TELEGRAM_SECRET_TOKEN!,
        }),
    },
    state: createRedisState(),
    concurrency: "queue",
    lockScope: "channel",
});

// === Handle Direct Messages ===
bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// === Handle Mentions ===
bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// Shared AI logic — uses @google/genai directly (no Vercel AI SDK needed)
async function handleAIResponse(thread: any, message: any) {
    try {
        console.log("[Bot] Subscribing to thread...");
        await thread.subscribe();
        console.log("[Bot] Subscribed.");

        const apiKeyExists = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        console.log("[Bot] API Key Exists:", apiKeyExists);

        if (!apiKeyExists) {
            throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
        }

        // Extract the user's text from the message
        const userText: string =
            typeof message.text === "string"
                ? message.text
                : message.content?.text ?? "Hello";

        console.log("[Bot] User message:", userText);
        console.log("[Bot] Calling Gemini...");

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: [{ role: "user", parts: [{ text: userText }] }],
        });

        const replyText =
            response.candidates?.[0]?.content?.parts?.[0]?.text ??
            "I couldn't generate a response.";

        console.log("[Bot] Gemini responded:", replyText.slice(0, 80));

        await thread.post(replyText);
        console.log("[Bot] Reply sent to Telegram.");
    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message ?? error);
        await thread
            .post("Sorry, I'm having trouble right now. Please try again.")
            .catch(() => {});
    }
}