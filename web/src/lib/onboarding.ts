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
    const userText = typeof message.text === "string" ? message.text.trim() : "";

    // Step 1: Welcome
    if (!existingBuyer) {
        await thread.post(
            `👋 Welcome to **Aligoo** AI Sales Agent!\n\n` +
            `I'm your 24/7 personal sales assistant. I can help you browse products, get quotes, and more.\n\n` +
            `Type **/start** to begin.`
        );

        // Light create buyer record (silent)
        await createOrUpdateBuyer(telegramId, {
            username: message.from?.username || message.author?.userName,
            firstInteraction: new Date().toISOString(),
            onboardingStep: "welcome",
        });

        return { handled: true };
    }

    // Step 2: /start → Terms Confirmation
    if (userText.toLowerCase() === "/start" && existingBuyer.onboardingStep === "welcome") {
        await thread.post({
            text: `Before we continue, please confirm:\n\n` +
                `• I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
                `• You allow us to save your name, phone, and preferences to provide better service.\n\n` +
                `This helps us serve you faster and remember your preferences.`,
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "✅ Agree & Continue", callback_data: "onboarding_agree" }],
                    [{ text: "❌ Reject", callback_data: "onboarding_reject" }]
                ]
            }
        });
        return { handled: true };
    }

    // Handle callback queries (Agree / Reject)
    if (message.callback_query) {
        const cbData = message.callback_query.data;

        if (cbData === "onboarding_reject") {
            await thread.post("No problem! You can still chat with me, but full features are limited.\n\nFor support, contact @aligoo_support");
            return { handled: true };
        }

        if (cbData === "onboarding_agree") {
            await createOrUpdateBuyer(telegramId, {
                onboardingStep: "name",
            });
            await thread.post("Great! What's your full name?");
            return { handled: true };
        }
    }

    // Step 3: Name Collection
    if (existingBuyer.onboardingStep === "name") {
        const fullName = userText;
        const firstName = fullName.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName,
            fullName,
            onboardingStep: "phone",
        });

        await thread.post(
            `Nice to meet you, **${firstName}**! 👋\n\n` +
            `Please tap the button below to share your phone number.`
        );

        // Show Share Contact button
        await thread.post({
            text: "Share your contact",
            replyMarkup: {
                keyboard: [[{ request_contact: true, text: "📱 Share Phone Number" }]],
                one_time_keyboard: true,
                resize_keyboard: true,
            }
        });

        return { handled: true };
    }

    // Step 4: Phone Number (from contact share)
    if (message.contact && existingBuyer.onboardingStep === "phone") {
        await createOrUpdateBuyer(telegramId, {
            phone: message.contact.phone_number,
            onboardingStep: "language",
        });

        await thread.post("Thank you! What's your preferred language?");
        await thread.post({
            text: "Choose language:",
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "🇪🇹 Amharic", callback_data: "lang_am" }],
                    [{ text: "🇬🇧 English", callback_data: "lang_en" }]
                ]
            }
        });
        return { handled: true };
    }

    // Step 5: Language
    if (message.callback_query?.data?.startsWith("lang_")) {
        const lang = message.callback_query.data === "lang_am" ? "am" : "en";

        await createOrUpdateBuyer(telegramId, {
            preferredLanguage: lang,
            onboardingStep: "interests",
        });

        // Show dynamic categories (we'll fetch them)
        // For now, placeholder - we'll enhance this soon
        await thread.post("Thank you! Final step...");
        // TODO: Call get categories and show buttons
    }

    return { handled: false, buyer: existingBuyer };
}