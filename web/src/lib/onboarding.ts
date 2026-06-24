// src/lib/onboarding.ts

import { client } from "@/sanity/client";
import { createOrUpdateBuyer } from "./sanity/buyer";
// src/lib/onboarding.ts

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

    console.log(`[Onboarding] User ${telegramId} - Step: ${existingBuyer?.onboardingStep || 'new'}`);

    // STEP 1: /start → Terms Confirmation
    if (userText === "/start") {
        const termsText = `Before we continue, please confirm:\n\n` +
            `• I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
            `• You allow us to save your name, phone, and preferences.\n` +
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

        if (cbData === "onboarding_agree" && existingBuyer?.onboardingStep === "terms") {
            await createOrUpdateBuyer(telegramId, { onboardingStep: "name" });
            await thread.post("Great! What's your full name?");
            return { handled: true };
        }

        // Language selection
        if (cbData.startsWith("lang_")) {
            const lang = cbData === "lang_am" ? "am" : "en";
            await createOrUpdateBuyer(telegramId, {
                preferredLanguage: lang,
                onboardingStep: "interests",
            });
            await showInterestCategories(thread, telegramId);
            return { handled: true };
        }
    }

    // STEP 2: Name Collection
    if (existingBuyer?.onboardingStep === "name") {
        const fullName = rawText;
        const firstName = fullName.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
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

    // STEP 3: Phone Number (Contact Share)
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

    return { handled: false, buyer: existingBuyer };
}

// Helper: Show dynamic product categories as vertical inline buttons
async function showInterestCategories(thread: any, telegramId: string) {
    try {
        const categories = await client.fetch(`
      *[_type == "product"]{ category } | group(category) { category }
    `);

        const uniqueCategories: string[] = Array.from(new Set(categories));

        const buttons = uniqueCategories.map(cat => [{
            text: cat.charAt(0).toUpperCase() + cat.slice(1),
            callback_data: `interest_${cat}`
        }]);

        await thread.post({
            text: "Thank you! You're all set. 🎉\n\nWhat are you most interested in today?",
            replyMarkup: { inline_keyboard: buttons }
        });

        await createOrUpdateBuyer(telegramId, { onboardingStep: "completed", status: "raw" });
    } catch (e) {
        console.error("[Onboarding] Failed to fetch categories:", e);
        await thread.post("Thank you! You're all set. 🎉\n\nHow can I help you today?");
    }
}