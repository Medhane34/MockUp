// src/lib/onboarding.ts
import type { SanityClient } from "next-sanity";
import type { TenantContext } from "@/types/tenant";
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
    telegramId: string,
    tenant: TenantContext,
    tenantClient: SanityClient
): Promise<OnboardingResult> {
    const msg = update.message ?? update.edited_message ?? null;
    const cbQuery = update.callback_query ?? null;

    const rawText = typeof msg?.text === "string" ? msg.text.trim() : "";
    const userText = rawText.toLowerCase();

    const from = msg?.from ?? cbQuery?.from ?? null;

    console.log(`[Onboarding][${tenant.companyName}] User ${telegramId} - Step: ${existingBuyer?.onboardingStep || 'new'}`);

    // ─── STEP 1: /start → show Terms ───────────────────────────────────────────
    if (userText === "/start") {
        const termsText =
            `Before we continue, please confirm:\n\n` +
            `• I agree to ${tenant.companyName}'s Terms of Service and Privacy Policy.\n` +
            `• You allow us to save your first name, phone, and preferences.\n` +
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
                response: { text: `No problem! You can still chat with me.\n\nFor support: ${tenant.supportHandle}` },
            };
        }

        if (cbData === "onboarding_agree") {
            await createOrUpdateBuyer(telegramId, {
                username: from?.username,
                onboardingStep: "name",
            }, tenantClient);

            return {
                handled: true,
                response: { text: "Great! What's your first name?" },
            };
        }

        // ─── Language selection ─────────────────────────────────────────────────
        if (cbData.startsWith("lang_")) {
            const lang = cbData === "lang_am" ? "am" : "en";
            await createOrUpdateBuyer(telegramId, {
                preferredLanguage: lang,
                onboardingStep: "interests",
            }, tenantClient);
            return await showInterestCategories(telegramId, tenantClient);
        }

        // ─── Interest selection ─────────────────────────────────────────────────
        if (cbData.startsWith("interest_")) {
            const interest = cbData.replace("interest_", "");
            await createOrUpdateBuyer(telegramId, {
                interests: [interest],
                onboardingStep: "completed",
                status: "raw",
            }, tenantClient);
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
        const firstName = rawText.split(" ")[0];

        await createOrUpdateBuyer(telegramId, {
            firstName: firstName.charAt(0).toUpperCase() + firstName.slice(1),
            onboardingStep: "phone",
        }, tenantClient);

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

    // ─── STEP 3: Phone Number (Contact Share Catching Step) ─────────────────────
    // ─── STEP 3: Phone Number (Contact Share Catching Step) ─────────────────────
    if (msg?.contact && existingBuyer?.onboardingStep === "phone") {
        await createOrUpdateBuyer(telegramId, {
            phone: msg.contact.phone_number,
            onboardingStep: "language",
        }, tenantClient);

        // 🔄 THE SEPARATION FIX: We split the operations into an array of two distinct responses.
        // The router block will process and send these in sequential order.
        return {
            handled: true,
            response: {
                text: "Saving phone number... 📱",
                // 1. First payload focuses strictly on closing the native keyboard drawer safely
                replyMarkup: { remove_keyboard: true }
            },
            // We append a custom field payload array here so route.ts knows there is a follow-up step
            nextResponse: {
                text: "Thank you! What's your preferred language? / እናመሰግናለን! የሚመርጡትን ቋንቋ ይምረጡ፦",
                // 2. Second payload focuses strictly on rendering your inline buttons cleanly
                replyMarkup: {
                    inline_keyboard: [
                        [{ text: "🇪🇹 Amharic (አማርኛ)", callback_data: "lang_am" }],
                        [{ text: "🇬🇧 English", callback_data: "lang_en" }],
                    ]
                }
            }
        } as any;
    }

    return { handled: false, buyer: existingBuyer };
}

// ─── Helper: Show dynamic product categories as inline buttons ────────────────
async function showInterestCategories(telegramId: string, tenantClient: SanityClient): Promise<OnboardingResult> {
    try {
        const cats: string[] = await tenantClient.fetch(
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
        await createOrUpdateBuyer(telegramId, { onboardingStep: "completed", status: "raw" }, tenantClient);
        return {
            handled: true,
            response: { text: "You're all set! 🎉\n\nHow can I help you today?" },
        };
    }
}
