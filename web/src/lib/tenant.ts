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
        status,
        enableInsightsDashboard
    }`;

    try {
        const result = await adminClient.withConfig({
            useCdn: true
        }).fetch(query, { cleanId }, {
            next: { revalidate: 60 }
        });
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
            status: result.status || "trial",
            enableInsightsDashboard: result.enableInsightsDashboard
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


/**
 * 🟢 GET TENANT BY SUBDOMAIN
 * Queries the central platform registry to load merchant configuration profiles.
 */
export async function getTenantBySubdomain(subdomain: string) {
    if (!subdomain || subdomain.trim() === "") {
        console.warn("[Tenant Registry] Aborted search: Subdomain string argument parameter is empty.");
        return null;
    }

    // Force lowercasing and trim whitespace to guarantee a perfect match against database records
    const cleanSubdomain = subdomain.trim().toLowerCase();

    // ─── 🟢 FIXED: REMOVED CONFLICTING MATCH OPERATOR SYNTAX ───
    // Using strict string equality matching prevents Sanity's API from throwing type 
    // evaluation errors, allowing your tenant profiles to load flawlessly into memory.
    // ─── 🟢 FIXED: RE-INJECTED THE SPLICING OPERATOR [0] ───
    const query = `*[_type == "tenant" && subdomain.current == $subdomain && status == "active"] | order(_updatedAt desc)[0]{
        _id,
        companyName,
        "subdomain": subdomain.current,
        niche,
        telegramBotToken,
        telegramWebhookSecret,
        systemPrompt,
        conversionGoalDescription,
        status,
        projectId,
        dataset,
        sanityApiToken,
        enableInsightsDashboard // Ensure this parameter is explicitly requested!
    }`;

    try {
        const result = await adminClient.withConfig({
            useCdn: true
        }).fetch(query, { subdomain: cleanSubdomain }, {
            next: { revalidate: 60 }
        });
        if (!result) {
            console.warn(`[Tenant Registry] Cache MISS: No matching database document found for subdomain: "${cleanSubdomain}"`);
            return null;
        }

        console.log(`[Tenant Registry] Cache HIT: Successfully loaded profile data for merchant: ${result.companyName}`);
        return result;

    } catch (err: any) {
        console.error(`[Tenant Registry] Query compilation error for subdomain [${cleanSubdomain}]:`, err.message);
        return null;
    }
}

/**
 * 🟢 GET TENANT FROM HOST
 * Extracts the active merchant subdomain token across local development and production environments.
 */
export async function getTenantFromHost(host: string | null) {
    if (!host || host.trim() === "") return null;

    // Isolate port segments completely (e.g., "aligoo.localhost:3000" -> "aligoo.localhost")
    const hostname = host.split(':')[0].trim().toLowerCase();
    const hostParts = hostname.split('.');

    let extractedSubdomainSlug = 'aligoo'; // Default target workspace baseline

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        extractedSubdomainSlug = 'aligoo';
    } else if (hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        // Local dev subdomain match (e.g., "muko.localhost" -> parts: ["muko", "localhost"])
        if (hostParts.length >= 2 && hostParts[0] !== 'www') {
            extractedSubdomainSlug = hostParts[0];
        }
    } else {
        // Production and staging domain handlers
        if (hostParts.length >= 3) {
            // e.g., "aligoo.aligoo-mockup.vercel.app" -> subdomain: "aligoo"
            // e.g., "aligoo-mockup.vercel.app" -> subdomain: "aligoo-mockup"
            extractedSubdomainSlug = hostParts[0];
        } else if (hostParts.length === 2) {
            // e.g., "aligoo.com" -> subdomain: "aligoo"
            if (hostParts[0] !== 'vercel' && hostParts[1] !== 'app') {
                extractedSubdomainSlug = hostParts[0];
            }
        }
    }

    // ─── 🌍 ALIGOO PRODUCTION DEPLOYMENT HINT MAPPING ───
    if (extractedSubdomainSlug === 'aligoo-mockup') {
        extractedSubdomainSlug = 'aligoo';
    }

    console.log(`[Tenant Host Resolver] Isolate host string derived target subdomain marker: "${extractedSubdomainSlug}"`);
    return await getTenantBySubdomain(extractedSubdomainSlug);
}
