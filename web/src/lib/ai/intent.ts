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
    | 'qualification'
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
 * Fast keyword-based intent detection (zero cost, high speed)
 */
function detectIntentByKeywords(text: string): IntentResult | null {
    const t = text.toLowerCase().trim();

    if (/^(hi|hello|hey|start|greetings|yo|howdy|salam)$/i.test(t) || t === "/start") {
        return { intent: "greeting", confidence: 1.0 };
    }

    if (/\b(return|refund|exchange|shipping|delivery|ship|post|courier|payment|pay|price|cost|how much|fee|faq|question|help|support)\b/i.test(t)) {
        let faqCategory = "General";
        if (/\b(return|refund|exchange)\b/i.test(t)) faqCategory = "Returns";
        else if (/\b(shipping|delivery|ship|post|courier)\b/i.test(t)) faqCategory = "Shipping";
        else if (/\b(payment|pay|price|cost|how much|fee)\b/i.test(t)) faqCategory = "Pricing";

        return { intent: "faq", confidence: 0.9, params: { faqCategory } };
    }

    if (/\b(order|checkout|buy|purchase|cart|book|booking|reserve|quote)\b/i.test(t)) {
        return { intent: "order", confidence: 0.85 };
    }

    if (/\b(products?|items?|catalog|shop|browse|list|store|categories|category|services?|packages?|tours?)\b/i.test(t)) {
        return { intent: "product_browse", confidence: 0.8 };
    }

    // New: Qualification intent
    if (/\b(need|want|looking for|interested in|recommend|best|help me choose)\b/i.test(t)) {
        return { intent: "qualification", confidence: 0.75 };
    }

    return null;
}

/**
 * Enhanced Intent Detection with Tenant Context
 */
export async function detectIntent(text: string, tenant: TenantContext): Promise<IntentResult> {
    const keywordResult = detectIntentByKeywords(text);
    if (keywordResult) {
        console.log(`[Intent][${tenant.companyName}] Keyword match: ${keywordResult.intent}`);
        return keywordResult;
    }

    console.log(`[Intent][${tenant.companyName}] No keyword match. Falling back to AI...`);

    try {
        const { object } = await generateObject({
            model: "google/gemini-2.5-flash-lite" as any,
            schema: z.object({
                intent: z.enum(['product_browse', 'product_detail', 'faq', 'greeting', 'order', 'qualification', 'unknown']),
                confidence: z.number().min(0).max(1),
                params: z.object({
                    category: z.string().optional(),
                    slug: z.string().optional(),
                    faqCategory: z.string().optional(),
                }).optional(),
            }),
            prompt: `You are an AI intent classifier for "${tenant.companyName}", a ${tenant.niche} business.

User message: "${text}"

Classify into exactly one intent:
- greeting: Simple greeting or /start
- product_browse: Wants to see products/services
- product_detail: Asking about a specific item
- faq: Questions about shipping, returns, payments, etc.
- order: Ready to buy, book, or get quote
- qualification: Expressing need or seeking recommendation
- unknown: Unclear message`,
        });

        console.log(`[Intent][${tenant.companyName}] AI classified: ${object.intent} (${object.confidence})`);
        return {
            intent: object.intent as IntentType,
            confidence: object.confidence,
            params: object.params,
        };
    } catch (error) {
        console.error(`[Intent][${tenant.companyName}] AI failed:`, error);
        return { intent: "unknown", confidence: 0.0 };
    }
}