// src/lib/onboarding.ts
import { client } from "@/sanity/client";
import { createOrUpdateBuyer } from "./sanity/buyer";

type OnboardingResult = {
    handled: boolean;
    response?: {
        text: string;
        replyMarkup?: any;
    };
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

    // STEP 1: /start → Terms Confirmation (NO Buyer creation yet)
    if (userText === "/start") {
        const termsText = `Before we continue, please confirm:\n\n` +
            `- I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
            `- You allow us to save your name, phone, and preferences.\n` +
            `- Your data will only be used to improve your shopping experience.`;

        return {
            handled: true,
            response: {
                text: termsText,
                replyMarkup: {
                    inline_keyboard: [
                        [{ text: "✅ Agree & Continue", callback_data: "onboarding_agree" }],
                        [{ text: "❌ Reject", callback_data: "onboarding_reject" }]
                    ]
                }
            }
        };
    }

    // Handle Inline Button Clicks
    if (message.callback_query) {
        const cbData = message.callback_query.data;

        if (cbData === "onboarding_reject") {
            return {
                handled: true,
                response: { text: "No problem! You can still chat with me.\n\nFor support: @aligoo_support" }
            };
        }

        if (cbData === "onboarding_agree") {
            // Create Buyer document ONLY after user agrees
            await createOrUpdateBuyer(telegramId, {
                username: message.from?.username || message.author?.userName,
                onboardingStep: "name"
            });

            return {
                handled: true,
                response: { text: "Great! What's your full name?" }
            };
        }
    }

    // STEP 2: Name Collection
    if (existingBuyer?.onboardingStep === "name") {
        const fullName = rawText;
        const firstName = fullName.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
            fullName,
            onboardingStep: "phone"
        });

        return {
            handled: true,
            response: {
                text: `Nice to meet you, **${firstName}**! 👋\n\nPlease tap the button below to share your phone number.`,
                replyMarkup: {
                    keyboard: [[{ request_contact: true, text: "📱 Share Phone Number" }]],
                    one_time_keyboard: true,
                    resize_keyboard: true
                }
            }
        };
    }

    // STEP 3: Phone Number (Contact Share)
    if (message.contact && existingBuyer?.onboardingStep === "phone") {
        await createOrUpdateBuyer(telegramId, {
            phone: message.contact.phone_number,
            onboardingStep: "language"
        });

        return {
            handled: true,
            response: {
                text: "Thank you! What's your preferred language?",
                replyMarkup: {
                    inline_keyboard: [
                        [{ text: "🇪🇹 Amharic", callback_data: "lang_am" }],
                        [{ text: "🇬🇧 English", callback_data: "lang_en" }]
                    ]
                }
            }
        };
    }

    // STEP 4: Language + Final Step
    if (message.callback_query?.data?.startsWith("lang_")) {
        const lang = message.callback_query.data === "lang_am" ? "am" : "en";
        await createOrUpdateBuyer(telegramId, { preferredLanguage: lang, onboardingStep: "interests" });
        return await showInterestCategories(telegramId);
    }

    return { handled: false, buyer: existingBuyer };
}

// Final Step: Dynamic Categories
async function showInterestCategories(telegramId: string) {
    try {
        const cats = await client.fetch(`
      *[_type == "product" && defined(category)].category | unique
    `);

        const buttons = cats.map((cat: string) => [{
            text: cat.charAt(0).toUpperCase() + cat.slice(1),
            callback_data: `interest_${cat}`
        }]);

        return {
            handled: true,
            response: {
                text: "Thank you! You're all set. 🎉\n\nWhat are you most interested in today?",
                replyMarkup: { inline_keyboard: buttons }
            },
            buyer: await createOrUpdateBuyer(telegramId, {
                onboardingStep: "completed",
                status: "raw"
            })
        };
    } catch (e) {
        console.error("[Onboarding] Categories fetch failed:", e);
        return {
            handled: true,
            response: { text: "Thank you! You're all set. 🎉\n\nHow can I help you today?" }
        };
    }
}