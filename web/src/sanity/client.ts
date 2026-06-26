// src/sanity/client.ts
import { createClient, type SanityClient } from "next-sanity";
import type { TenantContext } from "@/types/tenant";

/**
 * Platform admin client — connects to YOUR Sanity project.
 * Used only for tenant lookup (getTenantBySubdomain etc).
 * Never used for tenant data reads/writes.
 */
export const adminClient = createClient({
    projectId: process.env.SANITY_STUDIO_PROJECT_ID!,
    dataset: "production",
    token: process.env.SANITY_API_WRITE_TOKEN,
    apiVersion: "2026-06-01",
    useCdn: false,
});

/**
 * Per-tenant Sanity client cache.
 * Keyed by projectId to avoid creating a new client instance on every request.
 */
const tenantClientCache = new Map<string, SanityClient>();

/**
 * Creates (or returns a cached) Sanity client for a specific tenant's isolated project.
 * @param tenant - The resolved TenantContext for this request
 */
export function createTenantClient(tenant: Pick<TenantContext, 'projectId' | 'dataset' | 'sanityApiToken' | 'companyName'>): SanityClient {
    const cached = tenantClientCache.get(tenant.projectId);
    if (cached) return cached;

    if (!tenant.projectId) {
        throw new Error(`[Sanity] Tenant "${tenant.companyName}" is missing a Sanity projectId`);
    }

    const client = createClient({
        projectId: tenant.projectId,
        dataset: tenant.dataset || 'production',
        token: tenant.sanityApiToken,
        apiVersion: '2026-06-01',
        useCdn: false, // Always fresh data for AI sales responses
    });

    tenantClientCache.set(tenant.projectId, client);
    return client;
}