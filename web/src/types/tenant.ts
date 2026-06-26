// src/types/tenant.ts
/**
 * TenantContext — the single source of truth for all tenant-specific data.
 * Resolved once per request in the webhook route and passed down the entire call stack.
 * Never accessed via global env vars in tenant-scoped code.
 */
export interface TenantContext {
    /** Sanity _id from the platform admin project */
    id: string;
    /** Human-readable company name (e.g., "Aligoo Store") */
    companyName: string;
    /** Subdomain slug (e.g., "aligoo") */
    subdomain: string;
    /** Business niche — drives AI persona and tool descriptions */
    niche: 'ecommerce' | 'services' | 'travel' | string;
    /** Telegram support handle used in AI responses (e.g., "@aligoo_support") */
    supportHandle: string;
    /** Optional custom AI system prompt. If absent, a niche-based default is generated. */
    systemPrompt?: string;
    /** Plain-language description of the conversion goal for the AI */
    conversionGoalDescription?: string;
    /** Tenant's Telegram bot token */
    telegramBotToken: string;
    /** Secret used to validate incoming Telegram webhook headers */
    telegramWebhookSecret: string;
    /** Tenant's own Sanity.io project ID */
    projectId: string;
    /** Tenant's Sanity dataset (usually "production") */
    dataset: string;
    /** Read/write API token for the tenant's Sanity project */
    sanityApiToken: string;
    /** Max AI messages allowed per day across all users */
    dailyMessageLimit: number;
    /** Tenant account status */
    status: 'active' | 'trial' | 'suspended';
}
