// src/lib/qualification.ts
import { generateObject } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { updateBuyerProfile } from './sanity/buyer';
import type { TenantConfig } from '@/types/tenant';

const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

export interface QualificationData {
    intentType?: string;
    coreNeed?: string;
    budgetRange?: string;
    interests?: string[];
    leadScore?: number;
    qualificationNotes?: string;
    qualificationStage?: 'new' | 'partial' | 'fully_qualified' | 'disqualified' | 'lost' | 'customer' | string;
    lastQualifiedAt?: string;
}

const vercelGateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * ─── SHADOW AI EXTRACTION WORKER ───
 * Invisibly parses customer budget choices and needs straight from conversational text.
 */
export async function shadowExtractQualification(userMessage: string): Promise<any> {
    try {
        const { object } = await generateObject({
            model: vercelGateway('google/gemini-2.5-flash'),
            schema: z.object({
                coreNeed: z.string().optional().describe("Clean extracted summary of what specific item or service they seek (e.g. 'Addis city tour', 'historical package'). Leave blank if greeting."),
                budgetRange: z.enum(['under_50k', '50k_100k', '100k_200k', '200k_500k', '500k_1M', 'over_1M']).optional().describe("Inferred budget enum range matching the business schema."),
            }),
            maxRetries: 3,
            providerOptions: {
                google: { useProduction: true },
                gateway: {
                    order: ['google'],
                    models: ['google/gemini-2.5-flash-preview-09-2025'],
                },
            },
            system: `You are an invisible background data extraction worker. 
                   Analyze the text and isolate buying parameters. Do NOT guess fields.`,
            prompt: userMessage,
        });
        return object;
    } catch (err) {
        console.error("[Vercel Gateway][Shadow Extraction Failed]", err);
        return null;
    }
}

/**
 * ─── SYSTEMS THINKING LEAD SCORER (2-POINT CONVERSATIONAL MATRIX) ───
 * 🔄 FIXED: Scaled to score exactly 2 data points (coreNeed + budgetRange).
 */
export function calculateDynamicLeadStatus(buyer: any): { stage: 'new' | 'partial' | 'fully_qualified'; score: number } {
    let populatedMetrics = 0;
    const blacklistedTokens = ["recommendation", "trigger_recommendation", "recommend_init", "unknown", "none", "null", "undefined", "true", "false", ""];

    function isValidDataBlock(field: any): boolean {
        if (!field || typeof field !== "string") return false;
        const cleanField = field.trim().toLowerCase();
        return cleanField.length >= 2 && !blacklistedTokens.includes(cleanField);
    }

    if (isValidDataBlock(buyer.coreNeed)) populatedMetrics++;
    if (isValidDataBlock(buyer.budgetRange)) populatedMetrics++;

    console.log(`[Metrics Engine] Active Field Count Captured: ${populatedMetrics}/2 -> B:${buyer.budgetRange}`);

    if (populatedMetrics === 0) {
        return { stage: 'new', score: 20 };
    } else if (populatedMetrics === 1) {
        return { stage: 'partial', score: 60 };
    } else {
        // Both coreNeed and budgetRange are fully populated conversational points!
        return { stage: 'fully_qualified', score: 100 };
    }
}

/**
 * ─── ADAPTIVE ADAPTION LIFE-CYCLE PIPELINE ───
 */
export async function processQualification(
    telegramId: string,
    intentResult: any,
    userMessage: string,
    tenantClient: any,
    tenant: TenantConfig,
    existingBuyer: any,
    adaptiveRule: any | null
) {
    const shadowData = await shadowExtractQualification(userMessage);
    const cleanMsg = userMessage.trim().toLowerCase();
    const containsRoutingToken = cleanMsg === "recommendation" || cleanMsg === "recommend_init";

    let baselineBuyerState = existingBuyer?.qualificationStage || 'new';
    if (existingBuyer?.lastInteraction && (baselineBuyerState === 'partial' || baselineBuyerState === 'fully_qualified')) {
        const lastActiveTime = new Date(existingBuyer.lastInteraction).getTime();
        const currentTime = new Date().getTime();
        const lostThresholdMs = 48 * 60 * 60 * 1000;

        if (currentTime - lastActiveTime > lostThresholdMs) {
            console.log(`[Lifecycle Engine] Lead timed out after 48 hours. Stage shifting to: lost`);
            baselineBuyerState = 'lost';
        }
    }

    const mergedProfile = {
        intentType: intentResult.intent,
        coreNeed: containsRoutingToken ? (existingBuyer?.coreNeed || "") : (shadowData?.coreNeed || existingBuyer?.coreNeed || ""),
        budgetRange: existingBuyer?.budgetRange || shadowData?.budgetRange || "",
        qualificationNotes: existingBuyer?.qualificationNotes || ""
    };

    if (shadowData?.coreNeed && !containsRoutingToken) {
        mergedProfile.qualificationNotes += `\n[Shadow AI]: ${shadowData.coreNeed} at ${new Date().toLocaleTimeString()}`;
    }

    // Compute standard lead scoring against our 2-point matrix
    const { stage, score } = calculateDynamicLeadStatus(mergedProfile);

    let finalStage = (baselineBuyerState === 'lost' || baselineBuyerState === 'disqualified') ? baselineBuyerState : stage;
    let finalScore = score;

    const effectiveBudget = (mergedProfile.budgetRange || "").trim().toLowerCase();
    const ruleDisqualifyKey = (adaptiveRule?.disqualificationBudgetKey || "").trim().toLowerCase();

    if (ruleDisqualifyKey !== "" && effectiveBudget !== "" && effectiveBudget === ruleDisqualifyKey) {
        console.log(`[Lifecycle Engine] Hard Disqualification Match: Budget "${effectiveBudget}" == Threshold "${ruleDisqualifyKey}".`);
        finalStage = 'disqualified';
        finalScore = 0;
    }

    const updatePayload: any = {
        ...mergedProfile,
        leadScore: finalScore,
        qualificationStage: finalStage,
        lastQualifiedAt: new Date().toISOString()
    };

    const savedBuyer = await updateBuyerProfile(telegramId, tenantClient, updatePayload);
    return savedBuyer || existingBuyer;
}
