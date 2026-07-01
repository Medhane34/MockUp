// src/lib/qualification.ts
import { generateObject } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { updateBuyerProfile } from './sanity/buyer';
import type { TenantContext } from '@/types/tenant';

export interface QualificationData {
    intentType?: string;
    coreNeed?: string;
    budgetRange?: string;
    timeline?: string;
    interests?: string[];
    leadScore?: number;
    qualificationNotes?: string;
    qualificationStage?: 'new' | 'partial' | 'fully_qualified' | 'disqualified' | 'lost' | string;
    lastQualifiedAt?: string;
}

// Unified Vercel AI Gateway Controller Instance
const vercelGateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * ─── SHADOW AI EXTRACTION WORKER ───
 */
export async function shadowExtractQualification(userMessage: string): Promise<any> {
    try {
        const { object } = await generateObject({
            model: vercelGateway('google/gemini-2.5-flash'), // Optimized stable gateway allocation
            schema: z.object({
                coreNeed: z.string().optional().describe("Clean extracted summary of what specific item/service they are seeking (e.g. 'video editing laptop', 'wedding outfit'). Leave blank if it's a generic greeting or chat text phrase."),
                budgetRange: z.enum(['under_50k', '50k_100k', '100k_200k', '200k_500k', '500k_1M', 'over_1M']).optional().describe("Inferred budget category range value choice matching your schema specifications."),
                timeline: z.enum(['immediate', '30_days', 'exploring']).optional().describe("Inferred buying urgency time preference threshold constraint."),
            }),
            providerOptions: {
                google: {
                    useProduction: true, // Forces Vercel to route over Google v1, not v1beta
                },
                gateway: {
                    order: ['google'],
                    models: ['google/gemini-2.5-flash-preview-09-2025'],
                },
            },
            system: `You are an invisible background data extraction worker. 
                   Analyze the message text and isolate buying parameters. 
                   Do NOT guess fields or extrapolate; extract parameters ONLY if clear semantic data is present.`,
            prompt: userMessage,
        });
        return object;
    } catch (err) {
        console.error("[Vercel Gateway][Shadow Extraction Failed]", err);
        return null;
    }
}

/**
 * ─── SYSTEMS THINKING LEAD SCORER WITH DATA STRUCTURAL FILTERS ───
 * Measures the exact valid parameters present in the buyer's data stock.
 */
export function calculateDynamicLeadStatus(buyer: any): { stage: 'new' | 'partial' | 'fully_qualified'; score: number } {
    let populatedMetrics = 0;

    // Safety list of known system placeholder strings to reject from scoring points
    const blacklistedTokens = ["recommendation", "trigger_recommendation", "recommend_init", "unknown", "none", "null", "undefined", "true", "false", ""];

    function isValidDataBlock(field: any): boolean {
        if (!field || typeof field !== "string") return false;
        const cleanField = field.trim().toLowerCase();

        if (cleanField.length < 2) return false;
        if (blacklistedTokens.includes(cleanField)) return false;

        return true;
    }

    if (isValidDataBlock(buyer.coreNeed)) populatedMetrics++;
    if (isValidDataBlock(buyer.budgetRange)) populatedMetrics++;
    if (isValidDataBlock(buyer.timeline)) populatedMetrics++;

    console.log(`[Metrics Engine] Active Field Count Captured: ${populatedMetrics}/3 -> B:${buyer.budgetRange} T:${buyer.timeline}`);

    if (populatedMetrics === 0) {
        return { stage: 'new', score: 20 };
    } else if (populatedMetrics < 3) {
        const score = 25 + (populatedMetrics * 20); // 45 or 65
        return { stage: 'partial', score };
    } else {
        return { stage: 'fully_qualified', score: 95 };
    }
}

/**
 * ─── ADAPTIVE ADAPTION PIPELINE (WITH DISQUALIFICATION & LOST HANDLING) ───
 */
export async function processQualification(
    telegramId: string,
    intentResult: any,
    userMessage: string,
    tenantClient: any,
    tenant: TenantContext,
    existingBuyer: any,
    adaptiveRule: any | null // Added visibility of resolved rule for category threshold matching
) {
    const shadowData = await shadowExtractQualification(userMessage);

    const cleanMsg = userMessage.trim().toLowerCase();
    const containsRoutingToken = cleanMsg === "recommendation" || cleanMsg === "recommend_init";

    // ─── LAYER A: TEMPORAL "LOST" TIMEOUT STATUS CHECK ───
    let baselineBuyerState = existingBuyer?.qualificationStage || 'new';
    if (existingBuyer?.lastInteraction && (baselineBuyerState === 'partial' || baselineBuyerState === 'fully_qualified')) {
        const lastActiveTime = new Date(existingBuyer.lastInteraction).getTime();
        const currentTime = new Date().getTime();

        // 🎛️ 48 Hours Timeout Threshold (48 * 60 * 60 * 1000 ms)
        const lostThresholdMs = 48 * 60 * 60 * 1000;

        if (currentTime - lastActiveTime > lostThresholdMs) {
            console.log(`[Lifecycle Engine] Lead timed out after 48 hours of silence. Shifting local stage copy to: lost`);
            baselineBuyerState = 'lost';
        }
    }

    const mergedProfile = {
        intentType: intentResult.intent,
        coreNeed: containsRoutingToken ? (existingBuyer?.coreNeed || "") : (shadowData?.coreNeed || existingBuyer?.coreNeed || ""),
        budgetRange: existingBuyer?.budgetRange || "",
        timeline: existingBuyer?.timeline || "",
        qualificationNotes: existingBuyer?.qualificationNotes || ""
    };

    if (shadowData?.coreNeed && !containsRoutingToken) {
        mergedProfile.qualificationNotes += `\n[Shadow AI]: ${shadowData.coreNeed} at ${new Date().toLocaleTimeString()}`;
    }

    // Inside processQualification in qualification.ts:

    // ─── LAYER B: COMPUTE STANDARD LEAD SCORING ───
    const { stage, score } = calculateDynamicLeadStatus(mergedProfile);

    // 🔄 FIXED CONFLICT HIERARCHY: We calculate the final state dynamically,
    // preserving 'lost' and 'disqualified' states.
    let finalStage = (baselineBuyerState === 'lost' || baselineBuyerState === 'disqualified') ? baselineBuyerState : stage;
    let finalScore = score;

    // ─── LAYER C: SAFE VERIFIED DISQUALIFICATION MATCHING ───
    const effectiveBudget = (mergedProfile.budgetRange || "").trim().toLowerCase();
    const ruleDisqualifyKey = (adaptiveRule?.disqualificationBudgetKey || "").trim().toLowerCase();

    // If a strict match to the forbidden threshold occurs, we enforce an absolute hard override
    if (
        ruleDisqualifyKey !== "" &&
        effectiveBudget !== "" &&
        effectiveBudget !== "recommendation" &&
        effectiveBudget === ruleDisqualifyKey
    ) {
        console.log(`[Lifecycle Engine] Hard Disqualification Match: Budget "${effectiveBudget}" == Threshold "${ruleDisqualifyKey}".`);

        // ✅ THIS LOCKS THE VALUE: It ensures standard scores can never overwrite a disqualification
        finalStage = 'disqualified';
        finalScore = 0;
    }

    const updatePayload: QualificationData = {
        ...mergedProfile,
        leadScore: finalScore,
        qualificationStage: finalStage, // Writes "disqualified" safely to your Sanity project dataset
        lastQualifiedAt: new Date().toISOString()
    };

    const savedBuyer = await updateBuyerProfile(telegramId, tenantClient, updatePayload);
    return savedBuyer || existingBuyer;
}


/**
 * ─── BILINGUAL & NICHE-ADAPTIVE KEYBOARDS ───
 */
export function getMissingParameterKeyboard(
    missingField: 'budgetRange' | 'timeline',
    language: 'am' | 'en',
    resolvedRule: any | null
) {
    const isAmharic = language === 'am';

    if (missingField === 'budgetRange') {
        const defaultBudgetText = isAmharic
            ? "እባክዎ ለእርስዎ የሚስማማውን የዋጋ ክልል ይምረጡ፦"
            : "Please select a budget range that matches your current requirements:";

        const promptText = isAmharic
            ? (resolvedRule?.customBudgetPromptAm || defaultBudgetText)
            : (resolvedRule?.customBudgetPromptEn || defaultBudgetText);

        let inlineButtons = [];
        if (resolvedRule?.customBudgetOptions && resolvedRule.customBudgetOptions.length > 0) {
            inlineButtons = resolvedRule.customBudgetOptions.map((opt: any) => ({
                text: isAmharic ? opt.buttonLabelAm : opt.buttonLabelEn,
                callback_data: `budget_${opt.callbackValue}`
            }));
        } else {
            inlineButtons = [
                { text: isAmharic ? "ከ 50k በታች" : "Under 50k", callback_data: "budget_under_50k" },
                { text: "50k - 100k", callback_data: "budget_50k_100k" },
                { text: isAmharic ? "ከ 100k በላይ" : "Over 100k", callback_data: "budget_100k_200k" }
            ];
        }

        return {
            text: promptText,
            replyMarkup: { inline_keyboard: [inlineButtons] }
        };
    }

    const defaultTimelineText = isAmharic
        ? "ይህን ግዢ መቼ ለመፈጸም አቅደዋል?"
        : "When are you looking to move forward with this purchase?";

    const timelinePromptText = isAmharic
        ? (resolvedRule?.customTimelinePromptAm || defaultTimelineText)
        : (resolvedRule?.customTimelinePromptEn || defaultTimelineText);

    let timelineButtons = [];
    if (resolvedRule?.customTimelineOptions && resolvedRule.customTimelineOptions.length > 0) {
        timelineButtons = resolvedRule.customTimelineOptions.map((opt: any) => ({
            text: isAmharic ? opt.buttonLabelAm : opt.buttonLabelEn,
            callback_data: `timeline_${opt.callbackValue}`
        }));
    } else {
        timelineButtons = [
            { text: isAmharic ? "በአስቸኳይ" : "Immediate", callback_data: "timeline_immediate" },
            { text: isAmharic ? "በ30 ቀናት ውስጥ" : "Within 30 Days", callback_data: "timeline_30_days" },
            { text: isAmharic ? "ለማየት ብቻ" : "Exploring", callback_data: "timeline_exploring" }
        ];
    }

    return {
        text: timelinePromptText,
        replyMarkup: { inline_keyboard: [timelineButtons] }
    };
}
