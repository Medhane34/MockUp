// src/lib/ai/prompts.ts
import type { TenantContext } from "@/types/tenant";

export interface PromptContext {
    userName: string;
    userMessage: string;
    detectedIntent: string;
    sanityContext?: string;
    tenant: TenantContext;
    userLanguage?: 'am' | 'en'; // Added language visibility into context payloads
}

// ─── Niche-specific vocabulary helpers ─────────────────────────────────────────
function getNicheItemLabel(niche: string): string {
    switch (niche) {
        case 'services': return 'services';
        case 'travel': return 'packages and tours';
        default: return 'products';
    }
}

function getNicheActionLabel(niche: string): string {
    switch (niche) {
        case 'services': return 'book a service';
        case 'travel': return 'book a tour or package';
        default: return 'make a purchase';
    }
}

/**
 * Builds the AI system prompt for a given tenant.
 * Sets the baseline cross-language compliance parameters safely.
 */
export function buildSystemPrompt(tenant: TenantContext): string {
    if (tenant.systemPrompt?.trim()) {
        return tenant.systemPrompt;
    }

    const itemLabel = getNicheItemLabel(tenant.niche);
    const actionLabel = getNicheActionLabel(tenant.niche);

    return `You are ${tenant.companyName}'s AI Assistant — a friendly, professional, and helpful assistant on Telegram.
Your goal is to help users browse ${itemLabel}, get details, answer FAQs, and guide them to ${actionLabel}.

Communication Guidelines:
- Tone: Professional, friendly, helpful, and concise (optimized for Telegram chat).
- Formatting: Use Telegram-compatible tags. Bold using *text*, italic using _text_.
- Do NOT use [text](url) markdown link format — Telegram parses it strictly. Write URLs as plain text.
- Always provide a clear next step or call-to-action (CTA).
- If something is unavailable, politely inform the user and suggest alternatives.
- For support or human assistance, direct users to: ${tenant.supportHandle}
${tenant.conversionGoalDescription ? `\nConversion Goal: ${tenant.conversionGoalDescription}` : ''}`;
}

// ─── Contextual prompt builders ─────────────────────────────────────────────────

export function buildSalesPrompt(ctx: PromptContext): string {
    const itemLabel = getNicheItemLabel(ctx.tenant.niche);
    const isAmharic = ctx.userLanguage === 'am';

    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Target Language: ${ctx.userLanguage || 'en'}

${ctx.tenant.companyName} Catalog Data Context:
${ctx.sanityContext || `No specific ${itemLabel} context found.`}

CRITICAL INSTRUCTIONS FOR TRANSFERS:
1. Help the user find the ${itemLabel} they want. Present them enthusiastically with key details.
2. Always include price and availability status.
3. ${isAmharic ? `
- WARNING: The database context contains English strings. Because Target Language is 'am', you MUST translate these product names, categories, and attributes instantly into clean, natural Amharic script (ፊደል). 
- Do NOT output English words or code blocks. For instance, if data shows name: "Coffee", write "የቡና ማሽን" or "ቡና".
- For price tokens, append 'ብር' or 'ETB' accurately (e.g., '500 ብር').` : 'Present all fields clearly in English.'}
4. Suggest they can ask for specific details about any single ${itemLabel.replace(/s$/, '')} by mentioning its name.
`;
}

export function buildInfoPrompt(ctx: PromptContext): string {
    const isAmharic = ctx.userLanguage === 'am';

    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Target Language: ${ctx.userLanguage || 'en'}

${ctx.tenant.companyName} FAQ Data Context:
${ctx.sanityContext || "No specific FAQ context found."}

CRITICAL INSTRUCTIONS FOR TRANSFERS:
1. Answer the user's question clearly and concisely based on the FAQ context data listed above.
2. ${isAmharic ? `
- WARNING: The FAQ information context is in English. You MUST translate both the question concepts and answer bodies on-the-fly into clean, conversational Amharic script (ፊደል). 
- Do NOT output English strings or raw brackets.` : 'Answer concisely in English.'}
3. If the context doesn't contain the answer, politely state that you do not have the answer and offer to connect them with support at ${ctx.tenant.supportHandle}.
4. Always end with a helpful next step.
`;
}

export function buildSupportPrompt(ctx: PromptContext): string {
    const actionLabel = getNicheActionLabel(ctx.tenant.niche);
    const isAmharic = ctx.userLanguage === 'am';

    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Target Language: ${ctx.userLanguage || 'en'}

Context:
${ctx.sanityContext || "No specific context found."}

CRITICAL INSTRUCTIONS FOR TRANSFERS:
1. Guide the user through the process to ${actionLabel}.
2. ${isAmharic ? 'Instruct the user completely in beautiful Amharic script how to proceed.' : 'Instruct the user clearly in English.'}
3. Tell them they can contact our support team at ${ctx.tenant.supportHandle} to complete their order or get personalized help.
4. Provide clear, step-by-step instructions.
`;
}

export function buildGreetingPrompt(ctx: PromptContext): string {
    const itemLabel = getNicheItemLabel(ctx.tenant.niche);
    const isAmharic = ctx.userLanguage === 'am';

    return `
User Message: "${ctx.userMessage}"
Target Language: ${ctx.userLanguage || 'en'}

Instructions:
Welcome the user warmly to ${ctx.tenant.companyName}.
Introduce yourself as the ${ctx.tenant.companyName} AI Assistant.
${isAmharic ? `
- Write your response completely in friendly, polite Amharic script (ፊደል).
- Explain you can help them browse ${getNicheItemLabel(ctx.tenant.niche)} (ምርቶች/አገልግሎቶች), answer operational questions (FAQ), and assist with orders.` : `
Briefly explain you can help them:
1. Browse ${itemLabel}.
2. Get details on specific ${itemLabel.replace(/s$/, '')}.
3. Answer FAQs (shipping, returns, payments, etc.).
4. Help them place an order or ${getNicheActionLabel(ctx.tenant.niche)}.`}

Ask how you can assist today.`;
}

export function buildFallbackPrompt(ctx: PromptContext): string {
    const isAmharic = ctx.userLanguage === 'am';

    return `
User Message: "${ctx.userMessage}"
Target Language: ${ctx.userLanguage || 'en'}

Instructions:
Be polite. Say you didn't quite catch that. 
${isAmharic ? `
- Respond entirely in natural Amharic script (ፊደል).
- Offer to help them browse items, look up frequently asked questions, or connect with manual support at ${ctx.tenant.supportHandle}.` : `
Offer to help with:
- Browsing the ${ctx.tenant.companyName} catalog
- Answering FAQs
- Placing an order
Or suggest they contact ${ctx.tenant.supportHandle} for direct help.`}`;
}
