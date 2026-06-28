// src/lib/sanity/buyer.ts
import type { SanityClient } from "next-sanity";

/**
 * All functions require a `tenantClient` — the per-tenant Sanity client.
 * Never use the adminClient here. Buyers live in each tenant's own project.
 */

/**
 * Retrieves a single buyer document by their unique Telegram ID.
 */
export async function getBuyer(telegramId: string, tenantClient: SanityClient) {
    const query = `*[_type == "buyer" && telegramId == $telegramId][0]`;
    return tenantClient.fetch(query, { telegramId });
}

/**
 * Retrieves an existing buyer or instantiates a new default record if they are a raw lead.
 * This guarantees downstream pipeline functions always operate on a valid profile object stock.
 */
export async function getOrCreateBuyer(telegramId: string, username: string, tenantClient: SanityClient) {
    const existing = await getBuyer(telegramId, tenantClient);

    if (existing) {
        return existing;
    }

    console.log(`[Buyer Engine] Registering brand new buyer profile document for ID: ${telegramId}`);
    return tenantClient.create({
        _type: 'buyer',
        telegramId,
        username: username || 'unknown',
        firstInteraction: new Date().toISOString(),
        lastInteraction: new Date().toISOString(),
        status: 'raw',
        totalMessages: 1,
        // Default Baseline Qualification State
        leadScore: 0,
        qualificationStage: 'new',
        intentType: 'unknown',
        coreNeed: '',
        budgetRange: '',
        timeline: '',
        qualificationNotes: '',
        interests: [],
        lastQualifiedAt: new Date().toISOString()
    });
}

/**
 * Unified, deterministic profile mutation patcher.
 * Merges conversational tracking counters alongside structural BANT parameters safely.
 */
export async function updateBuyerProfile(
    telegramId: string,
    tenantClient: SanityClient,
    updateData: {
        username?: string;
        status?: string;
        leadScore?: number;
        qualificationStage?: 'new' | 'partial' | 'fully_qualified' | string;
        intentType?: string;
        coreNeed?: string;
        budgetRange?: string;
        timeline?: string;
        interests?: string[];
        qualificationNotes?: string;
        lastQualifiedAt?: string;
    }
) {
    const buyer = await getBuyer(telegramId, tenantClient);
    if (!buyer) {
        console.error(`[Buyer Engine] Cannot update profile. Buyer not found for ID: ${telegramId}`);
        return null;
    }

    // Build the patch payload, ensuring empty variables or undefined markers don't erase existing database values
    const patchPayload: Record<string, any> = {
        lastInteraction: new Date().toISOString(),
        totalMessages: (buyer.totalMessages || 0) + 1,
    };

    if (updateData.username !== undefined) patchPayload.username = updateData.username;
    if (updateData.status !== undefined) patchPayload.status = updateData.status;
    if (updateData.leadScore !== undefined) patchPayload.leadScore = updateData.leadScore;
    if (updateData.qualificationStage !== undefined) patchPayload.qualificationStage = updateData.qualificationStage;
    if (updateData.intentType !== undefined) patchPayload.intentType = updateData.intentType;
    if (updateData.coreNeed !== undefined) patchPayload.coreNeed = updateData.coreNeed;
    if (updateData.budgetRange !== undefined) patchPayload.budgetRange = updateData.budgetRange;
    if (updateData.timeline !== undefined) patchPayload.timeline = updateData.timeline;
    if (updateData.interests !== undefined) patchPayload.interests = updateData.interests;
    if (updateData.qualificationNotes !== undefined) patchPayload.qualificationNotes = updateData.qualificationNotes;
    if (updateData.lastQualifiedAt !== undefined) patchPayload.lastQualifiedAt = updateData.lastQualifiedAt;

    console.log(`[Buyer Engine] Committing patch mutations to Sanity document: ${buyer._id}`);
    return tenantClient.patch(buyer._id).set(patchPayload).commit();
}

/**
 * Legacy compatibility fallback wrapper method. 
 * Maps directly over updateBuyerProfile to ensure existing platform controllers do not break.
 */
export async function createOrUpdateBuyer(telegramId: string, data: any, tenantClient: SanityClient) {
    const buyer = await getBuyer(telegramId, tenantClient);
    if (!buyer) {
        // Fallback create branch
        return tenantClient.create({
            _type: 'buyer',
            telegramId,
            firstInteraction: new Date().toISOString(),
            lastInteraction: new Date().toISOString(),
            status: 'raw',
            totalMessages: 1,
            leadScore: data.leadScore ?? 0,
            qualificationStage: data.qualificationStage ?? 'new',
            ...data
        });
    }
    return updateBuyerProfile(telegramId, tenantClient, data);
}
