import { Chat } from "chat";
import { createTelegramAdapter } from "@chat-adapter/telegram";
import { createRedisState } from "@chat-adapter/state-redis";
import { generateText } from "ai";
import { openai } from '@ai-sdk/openai';

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

bot.onNewMention(async (thread, message) => {
    console.log(`[Bot] Checkpoint 1: Event for ${message.author?.userName}`);

    try {
        await thread.subscribe();
        console.log("[Bot] Checkpoint 2: Subscribed");

        // === ENV KEY CHECK (SAFE LOGGING) ===
        const hasApiKey = !!process.env.OPENAI_API_KEY;
        const keyLength = process.env.OPENAI_API_KEY ? process.env.OPENAI_API_KEY.length : 0;
        console.log(`[Bot] Environment Verification -> Has Key: ${hasApiKey}, Key Length: ${keyLength}`);

        if (!hasApiKey) {
            throw new Error("CRITICAL: OPENAI_API_KEY environment variable is completely missing!");
        }

        console.log("[Bot] Checkpoint 3: Calling OpenAI...");

        // Separate OpenAI block to catch direct SDK issues
        let aiResult;
        try {
            aiResult = await generateText({
                model: openai("gpt-4o-mini"),
                messages: [{ role: "user", content: message.text }],
                system: `You are a professional AI Sales Agent. Be helpful, concise, and always move toward qualifying the lead.`,
            });
        } catch (aiError: any) {
            console.error("[Bot] OpenAI SDK Direct Error:", aiError?.message || aiError);
            throw new Error(`OpenAI Call Failed: ${aiError?.message || "Unknown OpenAI error"}`);
        }

        console.log("[Bot] Checkpoint 4: AI Response received");
        await thread.post(aiResult.text);
        console.log("[Bot] Checkpoint 5: Posted");

    } catch (error: any) {
        console.error("[Bot] ERROR:", error?.message || error);

        if (error?.code === "LOCK_FAILED") return;

        try {
            await thread.post(`Error: ${error?.message || "Sorry, I'm busy right now. Try again shortly."}`);
        } catch (_) { }
    }
});
