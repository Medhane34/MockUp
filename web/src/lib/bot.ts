import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
// 1. MUST change this import to pull createGoogleGenerativeAI
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// 2. Build a custom provider instance that forces the SDK to see your 53-character key
const customGoogleProvider = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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

// === Handle Direct Messages (Private Chat) ===
bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// === Handle Mentions (in Groups) ===
bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Mention from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

// Shared AI logic
async function handleAIResponse(thread: any, message: any) {
    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        console.log("[Bot] Checkpoint 3: Calling Gemini...");
        const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
        console.log("[Bot] Using API key length:", apiKey ? apiKey.length : 0);

        if (!apiKey) {
            throw new Error("No Gemini API key found in environment variables.");
        }

        // 3. Swap 'google(...)' for your configured 'customGoogleProvider(...)'
        const { text } = await generateText({
            model: customGoogleProvider('gemini-2.5-flash-lite'),
            messages: [{ role: "user", content: message.text! }],
            system: `You are a professional AI Sales Agent. Be helpful, concise, and sales-oriented.`,
        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        console.error("[Bot] Full Error Object:", error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}
