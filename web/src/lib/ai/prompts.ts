// src/lib/ai/prompts.ts
import type { TenantContext } from "@/types/tenant";

export interface PromptContext {
    userName: string;
    userMessage: string;
    detectedIntent: string;
    sanityContext?: string;
    tenant: TenantContext;
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
 * Uses the tenant's custom systemPrompt if configured,
 * otherwise auto-generates a niche-appropriate persona.
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
- Formatting: Use Telegram Markdown.
  - Bold: *text*
  - Italic: _text_
  - Do NOT use [text](url) markdown link format — Telegram parses it strictly. Write URLs as plain text.
- Always provide a clear next step or call-to-action (CTA).
- If something is unavailable, politely inform the user and suggest alternatives.
- For support or human assistance, direct users to: ${tenant.supportHandle}
${tenant.conversionGoalDescription ? `\nConversion Goal: ${tenant.conversionGoalDescription}` : ''}`;
}

// ─── Contextual prompt builders ─────────────────────────────────────────────────

export function buildSalesPrompt(ctx: PromptContext): string {
    const itemLabel = getNicheItemLabel(ctx.tenant.niche);
    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Detected Intent: ${ctx.detectedIntent}

${ctx.tenant.companyName} Catalog Context:
${ctx.sanityContext || `No specific ${itemLabel} context found.`}

Instructions:
Help the user find the ${itemLabel} they want. Present them enthusiastically with key details.
Always include price and availability.
Suggest they can ask for specific details about any ${itemLabel.replace(/s$/, '')} by mentioning its name.
`;
}

export function buildInfoPrompt(ctx: PromptContext): string {
    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Detected Intent: ${ctx.detectedIntent}

${ctx.tenant.companyName} FAQ Context:
${ctx.sanityContext || "No specific FAQ context found."}

Instructions:
Answer the user's question clearly and concisely based on the FAQ context above.
If the context doesn't contain the answer, politely say so and offer to connect them with support at ${ctx.tenant.supportHandle}.
Always end with a helpful next step.
`;
}

export function buildSupportPrompt(ctx: PromptContext): string {
    const actionLabel = getNicheActionLabel(ctx.tenant.niche);
    return `
User Name: ${ctx.userName}
User Message: "${ctx.userMessage}"
Detected Intent: ${ctx.detectedIntent}

Context:
${ctx.sanityContext || "No specific context found."}

Instructions:
Guide the user through the process to ${actionLabel}.
Tell them they can contact our support team at ${ctx.tenant.supportHandle} to complete their order or get personalized help.
Provide clear, step-by-step instructions.
`;
}

export function buildGreetingPrompt(ctx: PromptContext): string {
    const itemLabel = getNicheItemLabel(ctx.tenant.niche);
    return `
User Message: "${ctx.userMessage}"

Instructions:
Welcome the user warmly to ${ctx.tenant.companyName}.
Introduce yourself as the ${ctx.tenant.companyName} AI Assistant.
Briefly explain you can help them:
1. Browse ${itemLabel}.
2. Get details on specific ${itemLabel.replace(/s$/, '')}.
3. Answer FAQs (shipping, returns, payments, etc.).
4. Help them place an order or ${getNicheActionLabel(ctx.tenant.niche)}.

Ask how you can assist today.`;
}

export function buildFallbackPrompt(ctx: PromptContext): string {
    return `
User Message: "${ctx.userMessage}"

Instructions:
Be polite. Say you didn't quite catch that. Offer to help with:
- Browsing the ${ctx.tenant.companyName} catalog
- Answering FAQs
- Placing an order

Or suggest they contact ${ctx.tenant.supportHandle} for direct help.`;
}
