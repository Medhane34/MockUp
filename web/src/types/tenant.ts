// src/types/tenant.ts

/**
 * 📦 UNIFIED TENANT CONFIGURATION INTERFACE
 * The single source of truth for all multi-tenant environmental metadata.
 * Resolved once per incoming request and passed down across the entire call stack.
 */
export interface TenantConfig {
    /** Sanity document tracking ID from the central platform administration registry */
    id: string;
    /** Human-readable company name (e.g., "Aligoo Store") */
    companyName: string;
    /** Subdomain unique slug string (e.g., "aligoo") */
    subdomain: string;
    /** Business operational classification niche (e.g., 'ecommerce', 'services') */
    niche: 'ecommerce' | 'services' | 'travel' | string;
    /** Telegram customer service handle injected into chatbot frames (e.g., "@aligoo_support") */
    supportHandle: string;
    /** Optional custom merchant-level AI system instruction prompt string override */
    systemPrompt?: string;
    /** Plain-language summary directive outlining conversion target flows */
    conversionGoalDescription?: string;

    // ─── 🤖 TELEGRAM BOT ADAPTER CREDENTIALS ───
    telegramBotToken: string;
    telegramWebhookSecret: string;

    // ─── 🧠 SANITY WORKSPACE CONNECTIONS ───
    projectId: string;
    dataset: string;
    sanityApiToken: string;

    // ─── 💾 UPSTASH REDIS INFRASTRUCTURE INSTANCES ───
    redisUrl: string;
    redisToken: string;

    // ─── 🚀 QSTASH BACKGROUND QUEUE TOPICS ───
    qstashToken: string;
    qstashTopicId: string;
    qstashCurrentSigningKey: string;
    qstashNextSigningKey: string;

    // ─── 🟢 SANITY AI CONTEXT MCP RUNTIME ENGINE CONFIGS ───
    contextSlug: string;
    globalContextFilter: string;

    // ─── 📈 ACCOUNTING, SAAS TIERS, AND MEMORY QUOTAS ───
    dailyMessageLimit: number;
    monthlyAiTokenLimit: number;
    currentMonthTokens: number;
    monthlyAiCostLimit: number;
    /** Maximum conversation history dialogue rows to load into memory arrays per turn */
    maxMemoryLimit: number;
    /** Account subscription access state parameter string */
    status: 'active' | 'trial' | 'suspended';
}
