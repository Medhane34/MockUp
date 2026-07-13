// src/lib/sanity/getAgentConfig.ts
import { createTenantClient } from "@/sanity/client";
import type { TenantConfig } from "@/types/tenant";


export interface CategoryButtonMatrix {
    categoryReferenceValue: string;
    surveyInstructionTextEnglish: string;
    surveyInstructionTextAmharic: string;
    buttons: Array<{
        labelEnglish: string;
        labelAmharic: string;
        callbackValue: string;
    }>;
}


export interface AgentConfigResult {
    name: string;
    route: string;
    systemPrompt: string;
    slugHintTemplate?: string;
    fallbackMessage: string;
    categoryButtonMatrices?: CategoryButtonMatrix[];
}

interface CompilePromptArgs {
    rawPrompt: string;
    tenant: TenantConfig;
    initialContext: any;
    intentName: string;
    userText: string;      // ─── 🟢 FIXED: ADD THIS LINE TO THE INTERFACE
    languageCode: string;
    rawSlugHintTemplate?: string;
    targetSlug?: string;
    cmsAgentConfig?: AgentConfigResult | null;
    userBudget?: string;
    userInterests?: string;
}

const promptMemoryStateCache = new Map<string, { data: AgentConfigResult | null; expiresAt: number }>();
const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * 🏭 THE DYNAMIC PROMPT COMPILER MATRIX
 * Replaces Mustache placeholders with live runtime context variables and sanitizes whitespace.
 */
export function compileSystemPrompt({
    rawPrompt,
    tenant,
    initialContext,
    languageCode,
    rawSlugHintTemplate,
    targetSlug,
    userBudget,
    userInterests,
}: CompilePromptArgs): string {
    if (!rawPrompt) return "";

    const languageText = languageCode === 'am' ? 'Amharic (በአማርኛ)' : 'English';

    // 🟢 FIXED: RESOLVE INITIAL CONTEXT CLEANLY (NO RAW ESCAPED JSON NOISE)
    const cleanContextString = typeof initialContext === 'string'
        ? initialContext
        : JSON.stringify(initialContext, null, 2);

    // 🟢 FIXED: DYNAMIC SLUG HINT COMPILATION FROM CMS
    let compiledSlugHint = "";
    if (rawSlugHintTemplate && targetSlug) {
        compiledSlugHint = rawSlugHintTemplate.replace(/\{\{slug\}\}/g, targetSlug.trim());
    }

    return rawPrompt
        .replace(/\{\{companyName\}\}/g, tenant.companyName || "Our Store")
        .replace(/\{\{initialContext\}\}/g, cleanContextString)
        .replace(/\{\{languageText\}\}/g, languageText)
        .replace(/\{\{slugHint\}\}/g, compiledSlugHint)
        .replace(/\{\{tenantId\}\}/g, tenant.id || "")
        .replace(/\{\{userBudget\}\}/g, userBudget || "")
        .replace(/\{\{userInterests\}\}/g, userInterests || "")
        .trim();
}

/**
 * 🟢 GET DYNAMIC AGENT CONFIGURATION
 */
export async function getAgentConfig(
    tenant: TenantConfig,
    route: "route-a" | "route-b" | "route-c" | "route-d" | "route-e"
): Promise<AgentConfigResult | null> {
    const tenantId = tenant.projectId || tenant.id || "unknown";

    // 🟢 FIXED: CACHE KEY EXPLICITLY BINDS BOTH TENANT AND ROUTE INDICES
    const cacheKey = `${tenantId}:${route}`;
    const currentTimeStamp = Date.now();

    // 🟢 FIXED: ADDED EXPLICIT ENHANCEMENT CACHE HIT LOGGING TRACES
    const cachedNode = promptMemoryStateCache.get(cacheKey);
    if (cachedNode && currentTimeStamp < cachedNode.expiresAt) {
        const remainingSeconds = Math.round((cachedNode.expiresAt - currentTimeStamp) / 1000);
        console.log(`[AgentConfig] Cache HIT for key [${cacheKey}] — expires in ${remainingSeconds}s`);
        return cachedNode.data;
    }

    console.log(`[AgentConfig] Cache MISS for key [${cacheKey}] — fetching fresh configuration from Sanity Lake...`);

    const tenantIsolatedClient = createTenantClient({
        projectId: tenant.projectId,
        dataset: tenant.dataset || 'production',
        sanityApiToken: tenant.sanityApiToken,
        companyName: tenant.companyName
    });

    const query = `*[_type == "agentConfig" && route == $route && active == true][0]{
    name,
    route,
    systemPrompt,
    slugHintTemplate,
    fallbackMessage
  }`;

    try {
        const configDoc = await tenantIsolatedClient
            .withConfig({ useCdn: false }) // 🟢 FIXED: EXPLICIT CDN BYPASS SAFETY FOR FRESH SYSTEM PROMPTS
            .fetch<AgentConfigResult | null>(query, { route });

        promptMemoryStateCache.set(cacheKey, {
            data: configDoc,
            expiresAt: currentTimeStamp + PROMPT_CACHE_TTL_MS
        });

        return configDoc;
    } catch (err: any) {
        console.error(`❌ [AgentConfig Error] Failed to fetch document layout:`, err.message);
        return null;
    }
}
