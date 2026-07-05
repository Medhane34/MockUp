// src/lib/ai/tools.ts
import { tool } from "ai";
import { z } from "zod";
import type { SanityClient } from "next-sanity";
import type { TenantContext } from "@/types/tenant";
import { getProductList, getProductDetails, getFAQs, getProductRecommendations } from "@/lib/sanity/queries";

/**
 * Helper utility to convert conversational budget keys into strict mathematical pricing tiers.
 * Maps your Sanity Studio values explicitly to numerical search limits.
 */
function parsePriceRange(budgetRange?: string): { min: number; max: number } {
    const cleanRange = budgetRange?.toLowerCase().trim() || "";

    switch (cleanRange) {
        case 'under_50k':
            return { min: 0, max: 50000 };
        case '50k_100k':
            return { min: 50000, max: 100000 };
        case '100k_200k':
            return { min: 100000, max: 200000 };
        case '200k_500k':
            return { min: 200000, max: 500000 };
        case '500k_1m':
            return { min: 500000, max: 1000000 };
        case 'over_1m':
            return { min: 1000000, max: Infinity };
        default:
            return { min: 0, max: Infinity };
    }
}

/**
 * Builds tenant-aware Vercel AI SDK tools.
 * The tool descriptions are niche-adaptive so the AI understands the context correctly.
 * Stringifies outputs to prevent Gemini from spitting out raw compiler codes.
 *
 * @param tenantClient - Pre-built Sanity client for this tenant's project
 * @param tenant - TenantContext for niche-aware descriptions
 */
export function buildSanityTools(tenantClient: SanityClient, tenant: TenantContext) {
    const itemLabel = tenant.niche === 'services'
        ? 'services'
        : tenant.niche === 'travel'
            ? 'packages and tours'
            : 'products';

    return {
        getProductList: tool({
            description: `Get the list of available ${itemLabel} from the ${tenant.companyName} catalog, optionally filtered by category.`,
            inputSchema: z.object({
                category: z.string().optional().describe(`Optional category filter for the ${itemLabel}.`),
            }),
            execute: async ({ category }) => {
                const list = await getProductList(tenantClient, category);
                // 🔄 CRITICAL FIX: Convert arrays to a clean string format. 
                // This prevents Gemini from treating object blocks as executable programming code.
                return JSON.stringify(list || []);
            },
        }),

        getProductDetails: tool({
            description: `Get detailed information about a specific single ${itemLabel.replace(/s$/, '')} from ${tenant.companyName}, including price, availability, and description.`,
            inputSchema: z.object({
                slug: z.string().describe(`The unique slug of the ${itemLabel.replace(/s$/, '')} (e.g., 'leather-bag', 'haircut-package').`),
            }),
            execute: async ({ slug }) => {
                const details = await getProductDetails(tenantClient, slug);
                if (!details) {
                    return JSON.stringify({ error: `Item with slug '${slug}' not found in ${tenant.companyName}'s catalog.` });
                }
                // 🔄 CRITICAL FIX: Stringify object definitions for high semantic parsing accuracy
                return JSON.stringify(details);
            },
        }),

        getFAQs: tool({
            description: `Get Frequently Asked Questions for ${tenant.companyName}, covering topics like General, Shipping, Returns, Pricing, or Product.`,
            inputSchema: z.object({
                category: z.string().optional().describe("Optional FAQ category string: General, Shipping, Returns, Pricing, Product."),
            }),
            execute: async ({ category }) => {
                const faqs = await getFAQs(tenantClient, category);
                // 🔄 CRITICAL FIX: Ensure predictable text context string outputs
                return JSON.stringify(faqs || []);
            },
        }),
        // ─── 🟢 NEW HIGH-EFFICIENCY RECOMMENDATION TOOL ───
        getRecommendations: tool({
            description: `Get a filtered list of highly recommended ${itemLabel} matched exactly to a user's specific price range criteria and target category context.`,
            inputSchema: z.object({
                category: z.string().optional().describe("The user's targeted category context if identified."),
                budgetRange: z.string().optional().describe("The user's structural budget string identifier currently in their profile context."),
            }),
            execute: async ({ category, budgetRange }) => {
                console.log(`[Tool: getRecommendations] Running parameter filter for Category: ${category || 'All'}, Budget string: ${budgetRange}`);

                // Translate conversational dropdown tokens into strict numeric bounds
                const bounds = parsePriceRange(budgetRange);

                const matches = await getProductRecommendations(tenantClient, category, bounds.min, bounds.max);
                return JSON.stringify(matches || []);
            },
        }),
    };
}

export type SanityTools = ReturnType<typeof buildSanityTools>;
