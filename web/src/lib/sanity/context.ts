/**
 * ============================================================================
 * 🧠 HARDENED MULTI-TENANT SANITY AI CONTEXT RUNTIME ENGINE
 * ============================================================================
 */

import { createTenantRedisClient } from "@/lib/upstash";
import type { TenantConfig } from "@/types/tenant";

/**
 * 🟢 GET CACHED SCHEMA (Layer 2 Optimization)
 * Retrieves or warms up the compiled system schema definitions for a tenant.
 */
export async function getCachedSchema(tenant: TenantConfig): Promise<any> {
    if (!tenant.projectId || !tenant.dataset || !tenant.sanityApiToken || !tenant.contextSlug) {
        throw new Error(`[Context Cache] Rejection: Missing core config properties for tenant: ${tenant.companyName}`);
    }

    const tenantRedis = createTenantRedisClient(tenant);
    const cacheKey = `sanity:initial-context:${tenant.id}:${tenant.contextSlug}`;

    try {
        let initialContext = await tenantRedis.get<string>(cacheKey);

        if (!initialContext) {
            console.log(`[Context Cache][${tenant.companyName}] Schema cache MISS. Fetching fresh definitions from Sanity API...`);

            const res = await fetch(
                `https://api.sanity.io/v2026-03-03/context/mcp/${tenant.projectId}/${tenant.dataset}/${tenant.contextSlug}/initial-context`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${tenant.sanityApiToken}`,
                        "Accept": "application/json"
                    }
                }
            );

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`Sanity API Gateway rejected initial-context lookup: ${res.statusText} - ${errorText}`);
            }

            const rawText = await res.text();
            await tenantRedis.set(cacheKey, rawText, { ex: 3600 });
            return rawText;

        } else {
            console.log(`[Context Cache][${tenant.companyName}] Schema cache HIT for key: ${cacheKey}`);
            return initialContext;
        }

    } catch (err: any) {
        console.error(`[Context Cache][${tenant.companyName}] Schema fetch failed:`, err);
        throw new Error(`Schema unavailable for tenant ${tenant.companyName}: ${err.message}`);
    }
}

/**
 * 🟢 RUN SANITY CONTEXT QUERY (Layer 1 & 3 Execution)
 * Dispatches a standard compliant JSON-RPC HTTP POST specification package straight to the AI Context endpoint.
 */
export async function runSanityContextQuery(
    tenant: TenantConfig,
    groqQuery: string,
    cachedSchema?: any,
    groqFilter?: string
): Promise<any[]> {

    if (!tenant.projectId || !tenant.dataset || !tenant.sanityApiToken || !tenant.contextSlug) {
        throw new Error(`[Context RPC] Rejection: Missing transaction properties for tenant: ${tenant.companyName}`);
    }

    // ─── 🟢 TELEMETRY PLACEMENT FIXED ───
    // Log the generated query IMMEDIATELY before transmission.
    // This guarantees visibility in your Vercel console logs even if Sanity throws a 400 or 500 error!
    console.log(`\n🚀 [Context RPC][${tenant.companyName}] SENDING QUERY LAYER OVER THE WIRE:`);
    console.log(`----------------------------------------------------------------------`);
    console.log(groqQuery);
    console.log(`----------------------------------------------------------------------\n`);

    const params = new URLSearchParams();
    if (groqFilter) params.set('groqFilter', groqFilter);
    const targetUrl =
        `https://api.sanity.io/v2026-03-03/context/mcp/` +
        `${tenant.projectId}/${tenant.dataset}/${tenant.contextSlug}` +
        (params.toString() ? `?${params.toString()}` : '');

    try {
        const res = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${tenant.sanityApiToken}`,
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream"
            },
            body: JSON.stringify({
                jsonrpc: "2.0",
                method: "tools/call",
                params: {
                    name: "groq_query",
                    arguments: {
                        query: groqQuery
                    }
                },
                id: `${tenant.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`
            })
        });

        if (!res.ok) {
            const errBody = await res.text();
            throw new Error(`Sanity RPC Endpoint rejected command packet: ${res.status} - ${errBody}`);
        }

        const data = await res.json();

        if (data.error) {
            // Detailed formatting log extraction to catch bad escapes or syntax issues
            console.error(`❌ [Context RPC][${tenant.companyName}] Internal JSON-RPC execution error details:`, JSON.stringify(data.error, null, 2));
            throw new Error(`JSON-RPC Error [${data.error.code || 'unknown'}]: ${data.error.message || 'Malformed structure error'}`);
        }

        const content = data.result?.content || [];
        console.log(`✅ [Context RPC][${tenant.companyName}] Successfully retrieved ${content.length} data nodes.`);
        return content;

    } catch (err: any) {
        console.error(`❌ [Context RPC][${tenant.companyName}] Transport layer execution failure:`, err.message);
        throw new Error(`[Context RPC] Query execution failed for tenant ${tenant.companyName}: ${err.message}`);
    }
}

/**
 * Force manual eviction of schema maps
 */
export async function invalidateTenantSchemaCache(tenant: TenantConfig): Promise<void> {
    const tenantRedis = createTenantRedisClient(tenant);
    const cacheKey = `sanity:initial-context:${tenant.id}:${tenant.contextSlug}`;
    await tenantRedis.del(cacheKey);
    console.log(`[Context Cache][${tenant.companyName}] Schema cache cache wiped successfully.`);
}
