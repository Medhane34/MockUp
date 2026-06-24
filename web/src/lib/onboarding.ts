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

/**
 * Handles onboarding steps based on a full Telegram update object.
 * `update` can contain `update.message` (text/contact) or `update.callback_query` (button tap).
 */
export async function handleOnboarding(
    _thread: any,
    update: any,
    existingBuyer: any,
    telegramId: string
): Promise<OnboardingResult> {
    // Telegram sends either update.message or update.callback_query at the root level
    const msg = update.message ?? update.edited_message ?? null;
    const cbQuery = update.callback_query ?? null;

    const rawText = typeof msg?.text === "string" ? msg.text.trim() : "";
    const userText = rawText.toLowerCase();

    // Derive `from` regardless of update type
    const from = msg?.from ?? cbQuery?.from ?? null;

    console.log(`[Onboarding] User ${telegramId} - Step: ${existingBuyer?.onboardingStep || 'new'}`);

    // ─── STEP 1: /start → show Terms ───────────────────────────────────────────
    if (userText === "/start") {
        const termsText =
            `Before we continue, please confirm:\n\n` +
            `• I agree to Aligoo's Terms of Service and Privacy Policy.\n` +
            `• You allow us to save your name, phone, and preferences.\n` +
            `• Your data will only be used to improve your shopping experience.`;

        return {
            handled: true,
            response: {
                text: termsText,
                replyMarkup: {
                    inline_keyboard: [
                        [{ text: "✅ Agree & Continue", callback_data: "onboarding_agree" }],
                        [{ text: "❌ Reject", callback_data: "onboarding_reject" }],
                    ],
                },
            },
        };
    }

    // ─── Handle Inline Button Clicks (callback_query) ──────────────────────────
    if (cbQuery) {
        const cbData: string = cbQuery.data ?? "";

        if (cbData === "onboarding_reject") {
            return {
                handled: true,
                response: { text: "No problem! You can still chat with me.\n\nFor support: @aligoo_support" },
            };
        }

        if (cbData === "onboarding_agree") {
            // Create Buyer document ONLY after user agrees
            await createOrUpdateBuyer(telegramId, {
                username: from?.username,
                onboardingStep: "name",
            });

            return {
                handled: true,
                response: { text: "Great! What's your full name?" },
            };
        }

        // ─── Language selection ─────────────────────────────────────────────────
        if (cbData.startsWith("lang_")) {
            const lang = cbData === "lang_am" ? "am" : "en";
            await createOrUpdateBuyer(telegramId, {
                preferredLanguage: lang,
                onboardingStep: "interests",
            });
            return await showInterestCategories(telegramId);
        }

        // ─── Interest selection ─────────────────────────────────────────────────
        if (cbData.startsWith("interest_")) {
            const interest = cbData.replace("interest_", "");
            await createOrUpdateBuyer(telegramId, {
                interests: [interest],
                onboardingStep: "completed",
                status: "raw",
            });
            return {
                handled: true,
                response: {
                    text: `Perfect! You're all set and ready to shop. 🎉\n\nHow can I help you today? Ask me about products, pricing, or anything else!`,
                },
            };
        }
    }

    // ─── STEP 2: Name Collection ────────────────────────────────────────────────
    if (existingBuyer?.onboardingStep === "name" && rawText) {
        const fullName = rawText;
        const firstName = fullName.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
            fullName,
            onboardingStep: "phone",
        });

        return {
            handled: true,
            response: {
                text: `Nice to meet you, ${firstName}! 👋\n\nPlease tap the button below to share your phone number.`,
                replyMarkup: {
                    keyboard: [[{ request_contact: true, text: "📱 Share Phone Number" }]],
                    one_time_keyboard: true,
                    resize_keyboard: true,
                },
            },
        };
    }

    // ─── STEP 3: Phone Number (Contact Share) ───────────────────────────────────
    if (msg?.contact && existingBuyer?.onboardingStep === "phone") {
        await createOrUpdateBuyer(telegramId, {
            phone: msg.contact.phone_number,
            onboardingStep: "language",
        });

        return {
            handled: true,
            response: {
                text: "Thank you! What's your preferred language?",
                replyMarkup: {
                    inline_keyboard: [
                        [{ text: "🇪🇹 Amharic", callback_data: "lang_am" }],
                        [{ text: "🇬🇧 English", callback_data: "lang_en" }],
                    ],
                },
            },
        };
    }

    return { handled: false, buyer: existingBuyer };
}

// ─── Helper: Show dynamic product categories as inline buttons ────────────────
async function showInterestCategories(telegramId: string): Promise<OnboardingResult> {
    try {
        // array::unique() is the correct GROQ syntax for deduplication
        const cats: string[] = await client.fetch(
            `array::unique(*[_type == "product" && defined(category)].category)`
        );

        const buttons = cats.map((cat: string) => [
            {
                text: cat.charAt(0).toUpperCase() + cat.slice(1),
                callback_data: `interest_${cat}`,
            },
        ]);

        return {
            handled: true,
            response: {
                text: "Almost done! What are you most interested in? 🛍",
                replyMarkup: { inline_keyboard: buttons },
            },
        };
    } catch (e) {
        console.error("[Onboarding] Categories fetch failed:", e);
        // Graceful fallback: skip interest step, mark completed
        await createOrUpdateBuyer(telegramId, { onboardingStep: "completed", status: "raw" });
        return {
            handled: true,
            response: { text: "You're all set! 🎉\n\nHow can I help you today?" },
        };
    }
}