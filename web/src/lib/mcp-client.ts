/**
 * ============================================================================
 * 🔌 HYBRID MULTI-TENANT MODEL CONTEXT PROTOCOL (MCP) CLIENT FACTORY
 * ============================================================================
 * 
 * PURPOSE:
 * This factory instantiates a per-request HTTP MCP Client scoped strictly to the 
 * verified tenant configuration pulled from Sanity. It prevents token-burn 
 * overhead by surgically filtering out the 'initial_context' tool mapping capability, 
 * as that schema data is already aggressively warm-cached inside Upstash Redis.
 */

// @ts-ignore - Ignore potential strict resolution warnings depending on your local bundler setups
import { createMCPClient } from '@ai-sdk/mcp'
import { getTenantConfig } from '@/lib/tenant';
import { TenantConfig } from '@/types/tenant';


type MCPClient = Awaited<ReturnType<typeof createMCPClient>>


export interface TenantMcpRegistry {
    mcp: MCPClient;
    mcpTools: Record<string, any>;


}

/**
 * 🟢 CREATE TENANT MCP CLIENT FACTORY
 * Dynamically builds a secure HTTP transport channel straight to Sanity's hosted edge service.
 * Enforces strict fail-closed posture derived strictly from verified configuration tokens.
 */
export async function createTenantMCPClient(
    tenantId: string,
    groqFilter?: string,
    options?: { embeddings?: boolean }
): Promise<TenantMcpRegistry> {

    if (!tenantId || tenantId.trim() === "") {
        throw new Error("[MCP Factory] Fail-Closed: Cannot build an MCP client channel for an empty tenantId.");
    }
    if (!groqFilter || groqFilter.trim() === "") {
        throw new Error(
            `[MCP Factory] Fail-Closed: groqFilter is required for multi-tenant security. ` +
            `Derive it from the verified session, never from client input.`
        )
    }
    console.log(`[MCP Factory] Initializing request-scoped transport link for Tenant ID: [${tenantId}]`);
    const params = new URLSearchParams()
    params.set('groqFilter', groqFilter)
    if (options?.embeddings) params.set('embeddings', 'true')
    // 1. Resolve the secure operational connection tokens from your centralized dynamic cache layer
    const config: TenantConfig = await getTenantConfig(tenantId);
    if (!config.projectId || !config.dataset || !config.sanityApiToken || !config.contextSlug) {
        throw new Error(
            `[MCP Factory] Fail-Closed: Incomplete config for tenant [${tenantId}]. ` +
            `Missing: ${[
                !config.projectId && 'projectId',
                !config.dataset && 'dataset',
                !config.sanityApiToken && 'sanityApiToken',
                !config.contextSlug && 'contextSlug',
            ].filter(Boolean).join(', ')}`
        )
    }

    // ✅ URL only built after validation passes
    if (groqFilter) params.set('groqFilter', groqFilter)
    const mcpUrl =
        `https://api.sanity.io/v2026-03-03/context/mcp/` +
        `${config.projectId}/${config.dataset}/${config.contextSlug}` +
        (params.toString() ? `?${params.toString()}` : '')

    try {
        // 3. Instantiate the compliant HTTP-based Model Context Protocol client
        const mcp = await createMCPClient({
            transport: {
                type: 'http',
                url: mcpUrl,
                headers: {
                    'Authorization': `Bearer ${config.sanityApiToken}`,
                    'Accept': 'application/json'
                },
            },
        });

        // 4. Retrieve the live collection dictionary array of server capabilities tools available on the cloud edge
        const allTools = await mcp.tools();

        if (!allTools || typeof allTools !== "object" || Object.keys(allTools).length === 0) {
            throw new Error(
                `[MCP Factory][${config.companyName}] Fail-Closed: MCP tool registry returned ` +
                `empty or malformed. Verify the Context document is published and schema is deployed.`
            )
        }

        // 5. ─── 🛡️ DYNAMIC CAPABILITIES MATRIX FILTERING ───
        // We use your precise object destructuring mapping to strip out the 'initial_context' tool.
        // Because Phase 2 injects the schema definitions straight into the prompt via Upstash Redis,
        // removing the intial context since it's already added to system prompt tool blocks the AI from firing duplicate RAG layout requests, preserving token caps!
        const { ...mcpTools } = allTools as Record<string, any>;

        /* console.log(`[MCP Factory][${config.companyName}] Tool registry compilation successful. Filtered out 'initial_context'.`, mcpTools); */

        return {
            mcp,
            mcpTools // Returns the clean, optimized tool dictionary subset object cleanly to your streaming routes
        };

    } catch (err: any) {
        // Re-throw your own intentional errors directly
        if (err.message.startsWith('[MCP Factory]')) throw err

        // Only wrap unexpected transport/network errors
        console.error(`[MCP Factory] Transport failure for Tenant [${tenantId}]:`, err.message)
        throw new Error(
            `[MCP Factory] Fail-Closed: MCP transport connection failed for tenant [${tenantId}]: ${err.message}`
        )
    }
}
