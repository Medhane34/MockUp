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
export function getQualificationKeyboard(stage: string) {
    if (stage === 'needs' || stage === 'new') {
        return {
            text: "What are you looking for today?",
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "Electronics", callback_data: "interest_electronics" }],
                    [{ text: "Fashion", callback_data: "interest_fashion" }],
                    [{ text: "Home & Kitchen", callback_data: "interest_home" }],
                    [{ text: "Beauty", callback_data: "interest_beauty" }],
                    [{ text: "Agriculture", callback_data: "interest_agriculture" }],
                ]
            }
        };
    }

    if (stage === 'budget') {
        return {
            text: "What's your approximate budget range?",
            replyMarkup: {
                inline_keyboard: [
                    [{ text: "< 5,000 ETB", callback_data: "budget_low" }],
                    [{ text: "5,000 - 20,000 ETB", callback_data: "budget_medium" }],
                    [{ text: "> 20,000 ETB", callback_data: "budget_high" }],
                ]
            }
        };
    }

    return {
        text: "When do you need this by?",
        replyMarkup: {
            inline_keyboard: [
                [{ text: "Immediate", callback_data: "timeline_immediate" }],
                [{ text: "This Week", callback_data: "timeline_week" }],
                [{ text: "This Month", callback_data: "timeline_month" }],
                [{ text: "Exploring", callback_data: "timeline_exploring" }],
            ]
        }
    };
}