// src/lib/ai/intent.ts
import { generateObject } from "ai";
import { z } from "zod";
import type { TenantContext } from "@/types/tenant";

export type IntentType =
    | 'product_browse'
    | 'product_detail'
    | 'faq'
    | 'greeting'
    | 'order'
    | 'unknown';

export interface IntentResult {
    intent: IntentType;
    confidence: number;
    params?: {
        category?: string;
        slug?: string;
        faqCategory?: string;
    };
}

/**
 * Fast keyword-based intent detection (no AI cost).
 * FAQ and order keywords are universal across niches.
 * Product browse / greeting are also universal.
 */
function detectIntentByKeywords(text: string): IntentResult | null {
    const t = text.toLowerCase().trim();

    // Greeting
    if (/^(hi|hello|hey|start|greetings|yo|howdy)$/i.test(t) || t === "/start") {
        return { intent: "greeting", confidence: 1.0 };
    }

    // FAQ keywords (universal)
    if (/\b(return|refund|exchange|shipping|delivery|ship|post|courier|payment|pay|price|cost|how much|fee|faq|question|help|support)\b/i.test(t)) {
        let faqCategory = "General";
        if (/\b(return|refund|exchange)\b/i.test(t)) faqCategory = "Returns";
        else if (/\b(shipping|delivery|ship|post|courier)\b/i.test(t)) faqCategory = "Shipping";
        else if (/\b(payment|pay|price|cost|how much|fee)\b/i.test(t)) faqCategory = "Pricing";

        return { intent: "faq", confidence: 0.9, params: { faqCategory } };
    }

    // Order / Checkout (universal)
    if (/\b(order|checkout|buy|purchase|cart|book|booking|reserve)\b/i.test(t)) {
        return { intent: "order", confidence: 0.9 };
    }

    // Browse (universal — category extracted by AI fallback if needed)
    if (/\b(products?|items?|catalog|shop|browse|list|store|categories|category|services?|packages?|tours?)\b/i.test(t)) {
        return { intent: "product_browse", confidence: 0.85 };
    }

    return null;
}

/**
 * Detect user intent from their message.
 * Uses fast keyword matching first, then falls back to AI classification.
 *
 * @param text - User's message text
 * @param tenant - TenantContext provides niche/company info for the AI fallback prompt
 */
export async function detectIntent(text: string, tenant: TenantContext): Promise<IntentResult> {
    // 1. Try keyword matching first (free, fast)
    const keywordResult = detectIntentByKeywords(text);
    if (keywordResult) {
        console.log(`[Intent][${tenant.companyName}] Keyword match: ${keywordResult.intent}`);
        return keywordResult;
    }

    console.log(`[Intent][${tenant.companyName}] No keyword match. Falling back to AI classification...`);

    // 2. Fall back to AI classification using Vercel AI Gateway
    try {
        const { object } = await generateObject({
            model: "google/gemini-2.5-flash-lite" as any,
            schema: z.object({
                intent: z.enum(['product_browse', 'product_detail', 'faq', 'greeting', 'order', 'unknown']),
                confidence: z.number().min(0).max(1),
                params: z.object({
                    category: z.string().optional().describe("If product_browse, the category detected"),
                    slug: z.string().optional().describe("If product_detail, the product slug in lowercase-kebab-case"),
                    faqCategory: z.string().optional().describe("If faq, the category: General, Shipping, Returns, Pricing, Product"),
                }).optional(),
            }),
            prompt: `You are an AI intent classifier for "${tenant.companyName}", a ${tenant.niche} business assistant on Telegram.

User message: "${text}"

Classify the intent into one of these:
- 'greeting': User greeting the bot.
- 'product_browse': User wants to browse products/services/catalog (optionally filtered by a category).
- 'product_detail': User is asking for details about a specific product/service. Extract the name as a slug (lowercase-kebab-case).
- 'faq': User has questions about shipping, returns, payments, or general info.
- 'order': User is ready to buy, book, or place an order.
- 'unknown': The message is unclear or doesn't map to any of the above.`,
        });

        console.log(`[Intent][${tenant.companyName}] AI classified: ${object.intent} (confidence: ${object.confidence})`);
        return {
            intent: object.intent as IntentType,
            confidence: object.confidence,
            params: object.params,
        };
    } catch (error) {
        console.error(`[Intent][${tenant.companyName}] AI classification failed:`, error);
        return { intent: "unknown", confidence: 0.0 };
    }
}
