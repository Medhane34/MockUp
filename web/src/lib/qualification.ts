// src/lib/qualification.ts
import { createOrUpdateBuyer } from './sanity/buyer';
import type { TenantContext } from '@/types/tenant';

export interface QualificationData {
    intentType?: string;
    coreNeed?: string;
    budgetRange?: string;
    timeline?: string;
    interests?: string[];
    leadScore?: number;
    qualificationNotes?: string;
    qualificationStage?: string;
    lastQualifiedAt?: string;
}

/**
 * Main Qualification Engine
 */
export async function processQualification(
    telegramId: string,
    intentResult: any,
    userMessage: string,
    tenantClient: any,
    tenant: TenantContext
) {
    const data: QualificationData = {
        intentType: intentResult.intent,
    };

    // Stage 1: Intent already captured
    if (intentResult.intent === 'qualification' || intentResult.intent === 'product_browse') {
        data.coreNeed = userMessage;
        data.qualificationNotes = `User expressed interest in: ${userMessage}`;
    }

    // Basic scoring
    let score = 40;
    if (intentResult.intent === 'order') score = 85;
    else if (intentResult.intent === 'product_detail') score = 70;
    else if (intentResult.intent === 'qualification') score = 65;

    data.leadScore = score;

    // Save to Buyer profile
    await createOrUpdateBuyer(telegramId, {
        ...data,
        qualificationStage: score >= 70 ? 'qualified' : 'needs',
        lastQualifiedAt: new Date().toISOString(),
    }, tenantClient);

    console.log(`[Qualification][${tenant.companyName}] User ${telegramId} scored ${score}`);

    return data;
}

/**
 * Structured Question Flow (Next Message Suggestions)
 */
export function getNextQualificationQuestion(stage: string, data: QualificationData) {
    if (stage === 'new' || !data.intentType) {
        return "What are you looking for today?";
    }

    if (!data.coreNeed) {
        return "Can you tell me more about what you need?";
    }

    if (!data.budgetRange) {
        return "What's your approximate budget range?";
    }

    if (!data.timeline) {
        return "When do you need this by?";
    }

    return "Would you like a personalized recommendation?";
}