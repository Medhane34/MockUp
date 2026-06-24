// src/lib/onboarding.ts

import { createOrUpdateBuyer } from "./sanity/buyer";


type OnboardingResult = {
    handled: boolean;
    buyer?: any;
};

export async function handleOnboarding(
    thread: any,
    message: any,
    existingBuyer: any,
    telegramId: string
): Promise<OnboardingResult> {
    const rawText = typeof message.text === "string" ? message.text.trim() : "";
    const userText = rawText.toLowerCase();

    console.log(`[Onboarding] Step check for user ${telegramId}. Current step: ${existingBuyer?.onboardingStep || 'new'}`);

    // === STEP 1: /start → Terms Confirmation ===
    if (userText === "/start") {
        console.log("[Onboarding] /start detected - showing terms");

        const termsText = `Before we continue, please confirm:\n\n` +
            `• I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
            `• You allow us to save your name, phone, and preferences to give you better service.\n` +
            `• Your data will only be used to improve your shopping experience.`;

        await thread.post({
            text: termsText,
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "✅ Agree & Continue", callback_data: "onboarding_agree" }],
                    [{ text: "❌ Reject", callback_data: "onboarding_reject" }]
                ]
            }
        });

        await createOrUpdateBuyer(telegramId, {
            username: message.from?.username || message.author?.userName,
            onboardingStep: "terms",
        });

        return { handled: true };
    }

    // Handle Inline Button Clicks
    if (message.callback_query) {
        const cbData = message.callback_query.data;

        if (cbData === "onboarding_reject") {
            await thread.post("No problem! You can still chat with me.\n\nFor support: @aligoo_support");
            return { handled: true };
        }

        if (cbData === "onboarding_agree") {
            await createOrUpdateBuyer(telegramId, { onboardingStep: "name" });
            await thread.post("Great! What's your full name?");
            return { handled: true };
        }
    }

    // If we reach here, onboarding is not handling this message
    return { handled: false, buyer: existingBuyer };
}