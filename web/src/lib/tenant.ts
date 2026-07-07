// src/lib/tenant.ts
import { adminClient } from "@/sanity/client";
import type { TenantConfig } from "@/types/tenant"; // Adapts to your shared type paths

// ─── 1. TYPE DEFINITIONS FOR THE MULTI-TENANT CONFIG TRACK ───


// In-memory configuration cache pool to protect your Sanity API quotas from rapid polling spam
const tenantConfigMemoryCache = new Map<string, { config: TenantConfig; expires: number }>();
const PLATFORM_CONFIG_TTL = 5 * 60 * 1000; // 5 Minutes in-memory lifespan

// ─── 2. REUSABLE DYNAMIC CONFIGURATION FACTORY GETTER (updated) ───
/**
 * Dynamic Tenant Configuration Getter
 * Fetches and caches isolated multi-tenant environment states in real time.
 * Enforces strict fail-closed security posture.
 */
export async function getTenantConfig(tenantId: string): Promise<TenantConfig> {
    if (!tenantId || tenantId.trim() === "") {
        throw new Error("[Tenant Registry] Fail-Closed: Cannot fetch configuration for an empty tenantId.");
    }

    const cleanId = tenantId.trim();

    // Check if configuration exists inside our active memory pool
    const cachedRecord = tenantConfigMemoryCache.get(cleanId);
    if (cachedRecord && cachedRecord.expires > Date.now()) {
        return cachedRecord.config;
    }

    console.log(`[Tenant Registry] Cache MISS. Querying Central Platform Registry for ID: ${cleanId}`);

    // Dynamic database resolution lookup query
    // Ensure all platform, webhook, and AI context fields are requested together
    const query = `*[_type == "tenant" && (_id == $cleanId || _id match $cleanId)][0]{
        "id": _id,
        companyName,
        "subdomain": subdomain.current,
        niche,
        supportHandle,
        systemPrompt,
        conversionGoalDescription,
        telegramBotToken,
        telegramWebhookSecret,
        projectId,
        dataset,
        sanityApiToken,
        redisUrl,
        redisToken,
        qstashToken,
        qstashTopicId,
        qstashCurrentSigningKey,
        qstashNextSigningKey,
        "contextSlug": contextSlug.current,
        globalContextFilter,
        dailyMessageLimit,
        monthlyAiTokenLimit,
        currentMonthTokens,
        monthlyAiCostLimit,
        maxMemoryLimit,
        status
    }`;

    try {
        const result = await adminClient.fetch<TenantConfig | null>(query, { cleanId });

        if (!result) {
            throw new Error(`[Tenant Registry] Unauthorized: Tenant with ID "${cleanId}" does not exist in master registry.`);
        }

        // Enforce strict non-empty checks on critical operational parameters before letting traffic through
        if (!result.projectId || !result.sanityApiToken || !result.redisUrl || !result.redisToken) {
            throw new Error(`[Tenant Registry] Misconfigured: Tenant "${result.companyName}" is missing active database or project credentials.`);
        }

        // Sanitize field configurations explicitly
        const dynamicConfig: TenantConfig = {
            ...result,
            contextSlug: result.contextSlug || "sales-agent",
            globalContextFilter: result.globalContextFilter || '_type in ["product", "category", "faq"]',
            maxMemoryLimit: Number(result.maxMemoryLimit) || 5,
            status: result.status || "trial"
        };

        // Seed the memory cache pool
        tenantConfigMemoryCache.set(cleanId, {
            config: dynamicConfig,
            expires: Date.now() + PLATFORM_CONFIG_TTL
        });

        return dynamicConfig;

    } catch (err: any) {
        console.error(`[Tenant Registry] SECURE REJECTION CRASH: ${err.message}`);
        // Strict Fail-Closed posture: Bubble up the exception to kill the execution chain instantly
        throw err;
    }
}

// ─── 3. YOUR EXISTING MIDDLEWARE SUBDOMAIN RESOLUTION HELPERS ───
export async function getTenantBySubdomain(subdomain: string) {
    if (!subdomain) return null;

    const query = `*[_type == "tenant" && subdomain.current == $subdomain][0]{
        _id,
        companyName,
        subdomain,
        niche,
        telegramBotToken,
        telegramWebhookSecret,
        systemPrompt,
        conversionGoalDescription,
        status,
        projectId,
        dataset,
        sanityApiToken
    }`;

    return adminClient.fetch(query, { subdomain });
}

export async function getTenantFromHost(host: string | null) {
    if (!host) return null;

    const hostParts = host.split('.');
    let subdomain = 'default';

    if (hostParts.length >= 3) {
        subdomain = hostParts[0];
    }

    return getTenantBySubdomain(subdomain);
}
