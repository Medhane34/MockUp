// src/lib/sanity/buyer.ts
import type { SanityClient } from "next-sanity";

/**
 * All functions require a `tenantClient` — the per-tenant Sanity client.
 * Never use the adminClient here. Buyers live in each tenant's own project.
 */

export async function getBuyer(telegramId: string, tenantClient: SanityClient) {
    const query = `*[_type == "buyer" && telegramId == $telegramId][0]`;
    return tenantClient.fetch(query, { telegramId });
}

export async function createOrUpdateBuyer(telegramId: string, data: any, tenantClient: SanityClient) {
    const existing = await getBuyer(telegramId, tenantClient);

    if (existing) {
        return tenantClient.patch(existing._id).set(data).commit();
    } else {
        return tenantClient.create({
            _type: 'buyer',
            telegramId,
            firstInteraction: new Date().toISOString(),
            status: 'raw',
            totalMessages: 1,
            ...data,

            // Add these lines to set default qualification values
            leadScore: data.leadScore ?? 0,
            qualificationStage: data.qualificationStage ?? 'new',
        });
    }
}

export async function updateBuyerInteraction(telegramId: string, tenantClient: SanityClient, extraData: any = {}) {
    const buyer = await getBuyer(telegramId, tenantClient);
    if (!buyer) return null;

    return tenantClient.patch(buyer._id).set({
        lastInteraction: new Date().toISOString(),
        totalMessages: (buyer.totalMessages || 0) + 1,
        ...extraData,

        // Add these lines to update qualification values
        ...(extraData.leadScore !== undefined && { leadScore: extraData.leadScore }),
        ...(extraData.qualificationStage !== undefined && { qualificationStage: extraData.qualificationStage }),
        ...(extraData.intentType !== undefined && { intentType: extraData.intentType }),
        ...(extraData.coreNeed !== undefined && { coreNeed: extraData.coreNeed }),
        ...(extraData.budgetRange !== undefined && { budgetRange: extraData.budgetRange }),
        ...(extraData.timeline !== undefined && { timeline: extraData.timeline }),
        ...(extraData.interests !== undefined && { interests: extraData.interests }),
        ...(extraData.qualificationNotes !== undefined && { qualificationNotes: extraData.qualificationNotes }),
        ...(extraData.lastQualifiedAt !== undefined && { lastQualifiedAt: extraData.lastQualifiedAt }),
    }).commit();
}
