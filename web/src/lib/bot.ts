import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
// 1. Swap 'google' for 'createGoogleGenerativeAI'
import { createGoogleGenerativeAI } from '@ai-sdk/google';

// 2. Build your customized provider instance cleanly outside the handler
const customGoogleProvider = createGoogleGenerativeAI({
    // Dynamically fallback to whatever key you have present on Vercel
    apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,

    // OPTIONAL: Uncomment and add your custom URL endpoint if you use an AI Gateway proxy
    // baseURL: "https://cloudflare.com" 
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

bot.onDirectMessage(async (thread, message) => {
    console.log(`[Bot] Direct Message from ${message.author?.userName}`);
    await handleAIResponse(thread, message);
});

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

        // 3. Pass your custom provider instance directly into the model key
        const { text } = await generateText({
            model: customGoogleProvider('gemini-2.5-flash-lite'), // Only 1 argument here!
            messages: [{ role: "user", content: message.text! }],
            system: `You are a professional AI Sales Agent. Be helpful, concise, and sales-oriented.`,
        });

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(text);
        console.log("[Bot] Checkpoint 5: Message posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);
        await thread.post("Sorry, I'm having trouble right now. Please try again.").catch(() => { });
    }
}
