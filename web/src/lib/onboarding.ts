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
    const userText = typeof message.text === "string" ? message.text.trim().toLowerCase() : "";

    // Step 1 (New): /start → Terms Confirmation
    if (userText === "/start") {
        const termsText = `Before we continue, please confirm:\n\n` +
            `• I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
            `• You allow us to save your name, phone number, and preferences to provide personalized service and remember your interests.\n` +
            `• Your data will be used only for improving your shopping experience.`;

        await thread.post({
            text: termsText,
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "✅ Agree & Continue", callback_data: "onboarding_agree" }],
                    [{ text: "❌ Reject", callback_data: "onboarding_reject" }]
                ]
            }
        });

        // Create initial record
        await createOrUpdateBuyer(telegramId, {
            username: message.from?.username || message.author?.userName,
            onboardingStep: "terms",
        });

        return { handled: true };
    }

    // Handle Callback Queries
    if (message.callback_query) {
        const cbData = message.callback_query.data;

        if (cbData === "onboarding_reject") {
            await thread.post("No problem! You can still use basic features.\n\nFor support contact @aligoo_support");
            return { handled: true };
        }

        if (cbData === "onboarding_agree" && existingBuyer?.onboardingStep === "terms") {
            await createOrUpdateBuyer(telegramId, { onboardingStep: "name" });
            await thread.post("Great! What's your full name?");
            return { handled: true };
        }
    }

    // Step 2: Name Collection
    if (existingBuyer?.onboardingStep === "name") {
        const fullName = userText.charAt(0).toUpperCase() + userText.slice(1); // Capitalize
        const firstName = fullName.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName,
            fullName,
            onboardingStep: "phone",
        });

        await thread.post(`Nice to meet you, **${firstName}**! 👋\n\nPlease tap the button below to share your phone number.`);

        await thread.post({
            text: "Share Contact",
            replyMarkup: {
                keyboard: [[{ request_contact: true, text: "📱 Share Phone Number" }]],
                one_time_keyboard: true,
                resize_keyboard: true,
            }
        });
        return { handled: true };
    }

    // Step 3: Phone Number (Contact Share)
    if (message.contact && existingBuyer?.onboardingStep === "phone") {
        await createOrUpdateBuyer(telegramId, {
            phone: message.contact.phone_number,
            onboardingStep: "language",
        });

        await thread.post("Thank you! What's your preferred language?");

        await thread.post({
            text: "Choose your language:",
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "🇪🇹 Amharic", callback_data: "lang_am" }],
                    [{ text: "🇬🇧 English", callback_data: "lang_en" }]
                ]
            }
        });
        return { handled: true };
    }

    // Step 4: Language Selection
    if (message.callback_query?.data?.startsWith("lang_")) {
        const lang = message.callback_query.data === "lang_am" ? "am" : "en";

        await createOrUpdateBuyer(telegramId, {
            preferredLanguage: lang,
            onboardingStep: "completed",
            status: "raw",
            lastInteraction: new Date().toISOString(),
        });

        await thread.post(`Thank you, **${existingBuyer.firstName || 'there'}**! 🎉\n\nYou're all set!`);

        // TODO: Add dynamic category buttons here in next iteration
        await thread.post("What are you most interested in today?");

        return { handled: true };
    }

    return { handled: false, buyer: existingBuyer };
}