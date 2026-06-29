// src/lib/ai/intent.ts
import { google } from "@ai-sdk/google"; // 🟢 Restored native type-safe provider import
import { z } from "zod";
import type { TenantContext } from "@/types/tenant";
import { generateObject } from "ai";
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
    language: 'am' | 'en';
    params?: {
        category?: string;
        slug?: string;
        faqCategory?: string;
    };
}

/**
 * Initialize a central Google provider linked to your Vercel AI Gateway infrastructure.
 * This dynamically applies your new API key string from your Vercel environment variables.
 */
/* const gatewayGoogleProvider = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    // Ensure this baseURL matches the gateway proxy path configured in your route.ts
    baseURL: "https://aligoo-mockup.vercel.app/",
});
 */
/**
 * Super-fast checks for strictly identical core system triggers
 * Handled locally to keep the gateway clear of simple utility hits
 */
function checkInstantTriggers(text: string): IntentResult | null {
    const cleanText = text.toLowerCase().trim();

    if (cleanText === "/start" || cleanText === "start") {
        return { intent: "greeting", confidence: 1.0, language: 'en' };
    }

    return null;
}

/**
 * Enhanced Intent Detection with Tenant Context and Bilingual AI Processing
 */
export async function detectIntent(text: string, tenant: TenantContext): Promise<IntentResult> {
    // 1. Instant trigger check for baseline platform actions
    const structuralTrigger = checkInstantTriggers(text);
    if (structuralTrigger) {
        console.log(`[Intent][${tenant.companyName}] Trigger match: ${structuralTrigger.intent}`);
        return structuralTrigger;
    }

    console.log(`[Intent][${tenant.companyName}] Routing message to Vercel AI Gateway Router...`);

    try {
        const { object } = await generateObject({
            // 🔄 UPDATED: Now uses your initialized gateway instance.
            // Using 'gemini-1.5-flash' to leverage the large 1500 req/day free pool.
            model: google("gemini-1.5-flash"), schema: z.object({
                intent: z.enum(['product_browse', 'product_detail', 'faq', 'greeting', 'order', 'qualification', 'unknown']),
                confidence: z.number().min(0).max(1),
                language: z.enum(['am', 'en']).describe("Detected language of the user text. 'am' for Amharic script/transliteration, 'en' for English."),
                params: z.object({
                    category: z.string().optional().describe("Detected product/service category names"),
                    slug: z.string().optional().describe("Clean URL slug if specific item is requested"),
                    faqCategory: z.enum(['Returns', 'Shipping', 'Pricing', 'General']).optional().describe("Strict bucket for FAQs"),
                }).optional(),
            }),
            // 🔄 The gateway fallback parameter is now fully functional because it maps over an active gateway token
            providerOptions: {
                gateway: {
                    models: ['google/gemini-2.5-flash', 'google/gemini-1.5-flash'],
                },
            },
            system: `You are an expert bilingual (English & Amharic) intent classifier for "${tenant.companyName}", which operates in the ${tenant.niche} niche.
Your goal is to parse user intents accurately, resolving native variations, spelling variants, and Amharic script (ፊደል).

CRITICAL LANGUAGE DETECTION RULE:
- Set language to 'am' if the user writes in Amharic script (ፊደል) OR if they write Amharic words using English letters (Latin transliteration/Hinglish-style for Amharic, e.g., "selam", "sint new", "waga").
- Set language to 'en' ONLY if the text is actual English sentences/words (e.g., "Hello", "How much is this?").

CRITICAL INTENT RULES:
- greeting: Initial hellos/greetings in English (hi, hello) or Amharic (ሰላም, እንደምን አለህ).
- product_browse: General inquiries to see what is available, browse catalogs, menus, packages, or lists.
- product_detail: Deep dive query or technical questions about one specific item or item slug.
- faq: Operational procedural questions. Map 'faqCategory' field strictly to 'Returns', 'Shipping', 'Pricing', or 'General'.
- order: Actions showing they are immediately moving to transaction state (buy, book, pay, checkout, ሂሳብ ክፈል).
- qualification: Early exploration phase. They are stating their problems, needs, or asking you to make a choice/recommendation for them.
- unknown: Completely irrelevant text, garbage strings, or unparseable context.`,
            prompt: `User Message to evaluate: "${text}"`,
        });

        console.log(`[Intent][${tenant.companyName}] AI Gateway classified: ${object.intent} (${object.confidence})`);

        return {
            intent: object.intent as IntentType,
            confidence: object.confidence,
            params: object.params,
            language: object.language as 'am' | 'en',
        };
    } catch (error) {
        console.error(`[Intent][${tenant.companyName}] AI Gateway routing processing failed:`, error);
        return { intent: "unknown", confidence: 0.0, language: 'en' };
    }
}
