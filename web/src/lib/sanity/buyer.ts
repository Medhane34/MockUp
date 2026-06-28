// src/lib/sanity/buyer.ts
import type { SanityClient } from "next-sanity";

/**
 * Retrieves a single buyer document by their unique Telegram ID.
 * 🔄 FIXED: Appended [0] to the GROQ statement to ensure it explicitly returns 
 * a single Object primitive value block instead of a nested collection array structure.
 */
export async function getBuyer(telegramId: string, tenantClient: SanityClient) {
    const query = `*[_type == "buyer" && telegramId == $telegramId][0]`;
    return tenantClient.fetch(query, { telegramId });
}

/**
 * Retrieves an existing buyer or instantiates a new default record if they are a raw lead.
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
        // Default Baseline Qualification State parameters
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
        onboardingStep?: string;
        firstName?: string;
        phone?: string;
        preferredLanguage?: string;
    }
) {
    const buyer = await getBuyer(telegramId, tenantClient);
    if (!buyer) {
        console.error(`[Buyer Engine] Cannot update profile. Buyer not found for ID: ${telegramId}`);
        return null;
    }

    const patchPayload: Record<string, any> = {
        lastInteraction: new Date().toISOString(),
        totalMessages: (buyer.totalMessages || 0) + 1,
    };

    // Safely map all active parameter states onto the storage structures cleanly
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

    // 🔄 ADDED ONBOARDING SYSTEM FIELD HOOKS SAFELY HERE:
    if (updateData.onboardingStep !== undefined) patchPayload.onboardingStep = updateData.onboardingStep;
    if (updateData.firstName !== undefined) patchPayload.firstName = updateData.firstName;
    if (updateData.phone !== undefined) patchPayload.phone = updateData.phone;
    if (updateData.preferredLanguage !== undefined) patchPayload.preferredLanguage = updateData.preferredLanguage;

    console.log(`[Buyer Engine] Committing patch mutations to Sanity document: ${buyer._id}`);
    return tenantClient.patch(buyer._id).set(patchPayload).commit();
}

/**
 * Legacy compatibility fallback wrapper method.
 */
export async function createOrUpdateBuyer(telegramId: string, data: any, tenantClient: SanityClient) {
    const buyer = await getBuyer(telegramId, tenantClient);
    if (!buyer) {
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
