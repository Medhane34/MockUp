import { generateObject } from "ai";
import { z } from "zod";

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

function detectIntentByKeywords(text: string): IntentResult | null {
  const t = text.toLowerCase().trim();

  // Greeting
  if (/^(hi|hello|hey|start|greetings|yo|howdy)$/i.test(t) || t === "/start") {
    return { intent: "greeting", confidence: 1.0 };
  }

  // FAQ keywords
  if (/\b(return|refund|exchange|shipping|delivery|ship|post|courier|payment|pay|price|cost|how much|fee|faq|question|help|support)\b/i.test(t)) {
    let faqCategory = "General";
    if (/\b(return|refund|exchange)\b/i.test(t)) faqCategory = "Returns";
    else if (/\b(shipping|delivery|ship|post|courier)\b/i.test(t)) faqCategory = "Shipping";
    else if (/\b(payment|pay|price|cost|how much|fee)\b/i.test(t)) faqCategory = "Pricing";
    
    return { 
      intent: "faq", 
      confidence: 0.9, 
      params: { faqCategory } 
    };
  }

  // Order/Checkout
  if (/\b(order|checkout|buy|purchase|cart|checkout|pay)\b/i.test(t)) {
    return { intent: "order", confidence: 0.9 };
  }

  // Browse products
  if (/\b(products|items|catalog|shop|browse|list|store|categories|category)\b/i.test(t)) {
    // Try to extract category if present
    let category: string | undefined;
    if (/\b(electronics|electronic)\b/i.test(t)) category = "electronics";
    else if (/\b(fashion|clothing|clothes|wear)\b/i.test(t)) category = "fashion";
    else if (/\b(home|kitchen)\b/i.test(t)) category = "home";
    else if (/\b(beauty|makeup|cosmetics)\b/i.test(t)) category = "beauty";
    else if (/\b(agriculture|farming|plants|farm)\b/i.test(t)) category = "agriculture";

    return { 
      intent: "product_browse", 
      confidence: 0.9, 
      params: category ? { category } : undefined 
    };
  }

  return null;
}

export async function detectIntent(text: string): Promise<IntentResult> {
  // 1. Try keyword matching first (free, fast)
  const keywordResult = detectIntentByKeywords(text);
  if (keywordResult) {
    console.log(`[Intent] Keyword match: ${keywordResult.intent}`);
    return keywordResult;
  }

  console.log("[Intent] No keyword match. Falling back to Gemini intent classification...");

  // 2. Fall back to AI classification using generateObject
  try {
    const { object } = await generateObject({
      model: "google/gemini-2.5-flash-lite" as any,
      schema: z.object({
        intent: z.enum(['product_browse', 'product_detail', 'faq', 'greeting', 'order', 'unknown']),
        confidence: z.number().min(0).max(1),
        params: z.object({
          category: z.string().optional().describe("If product_browse, the category detected (electronics, fashion, home, beauty, agriculture)"),
          slug: z.string().optional().describe("If product_detail, the slug of the product the user is asking about (in lowercase-kebab-case, e.g. 'iphone-15', 'leather-bag')"),
          faqCategory: z.string().optional().describe("If faq, the category of FAQ: General, Shipping, Returns, Pricing, Product"),
        }).optional(),
      }),
      prompt: `You are an AI intent classifier for Aligoo Shopping Bot. Classify the following user message:
      
      User message: "${text}"
      
      Classify the intent into one of these:
      - 'greeting': User greeting the bot (e.g., hello, hi, how are you).
      - 'product_browse': User wants to browse products, see product catalog, or list products (optionally filtered by a category like electronics, fashion, home, beauty, agriculture).
      - 'product_detail': User is asking for details/information about a specific product. Try to extract/convert the product name to a slug (in lowercase-kebab-case).
      - 'faq': User has questions about shipping, returns, delivery, payments, or general bot info.
      - 'order': User is ready to buy, wants to order, checkout, or make a purchase.
      - 'unknown': The message is unclear, gibberish, or doesn't map to any of the above.
      `,
    });

    console.log(`[Intent] AI classified: ${object.intent} (confidence: ${object.confidence})`);
    return {
      intent: object.intent as IntentType,
      confidence: object.confidence,
      params: object.params,
    };
  } catch (error) {
    console.error("[Intent] AI intent detection failed:", error);
    return { intent: "unknown", confidence: 0.0 };
  }
}
