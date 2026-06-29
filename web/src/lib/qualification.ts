// src/lib/qualification.ts
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { updateBuyerProfile } from './sanity/buyer';
import type { TenantContext } from '@/types/tenant';
import { google } from "@ai-sdk/google"; // 🟢 Restored native type-safe provider import
import { createGateway } from '@ai-sdk/gateway';


// ─── GATEWAY INITIALIZATION ───────────────────────────────────────────────────────
// Use the GOOGLE_API_KEY from your environment variables.
// We explicitly set autoTokenFetching to true so you don't need to manage keys.
const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
});


export interface QualificationData {
    intentType?: string;
    coreNeed?: string;
    budgetRange?: string;
    timeline?: string;
    interests?: string[];
    leadScore?: number;
    qualificationNotes?: string;
    qualificationStage?: 'new' | 'partial' | 'fully_qualified' | string;
    lastQualifiedAt?: string;
}

/* // Initialize a standalone Google provider mapped specifically to your Vercel AI Gateway
const gatewayGoogleProvider = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://vercel.blog",
}); */

/**
 * ─── SHADOW AI EXTRACTION WORKER Updated───
 * Runs in the background to seamlessly extract BANT parameters without user friction.
 */
export async function shadowExtractQualification(userMessage: string): Promise<any> {
    try {
        const { object } = await generateObject({
            model: gateway('google/gemini-2.5-flash-preview-09-2025'),
            schema: z.object({
                coreNeed: z.string().optional().describe("Clean extracted summary of what specific item/service they are seeking (e.g. 'video editing laptop', 'wedding outfit'). Leave blank if they just said hello or generic phrases."),
                budgetRange: z.enum(['under_50k', '50k_100k', '100k_200k', '200k_500k', '500k_1M', 'over_1M']).optional().describe("Inferred budget category based on context cues."),
                timeline: z.enum(['immediate', '30_days', 'exploring']).optional().describe("Inferred buying urgency threshold."),
            }),
            system: `You are an invisible background data extraction worker. 
                     Analyze the message text and isolate buying parameters. 
                     Do NOT guess fields or extrapolate; extract parameters ONLY if clear semantic data is present.`,
            prompt: userMessage,
        });
        return object;
    } catch (err) {
        console.error("[Shadow AI Extraction Error]", err);
        return null;
    }
}

/**
 * ─── SYSTEMS THINKING LEAD SCORER ───
 * Computes the real-time 'Stock of Knowledge' you possess on a specific buyer.
 */
// src/lib/qualification.ts

/**
 * SYSTEMS THINKING LEAD SCORER WITH DATA STRUCTURAL FILTERS
 * Measures the exact valid parameters present in the buyer's data stock.
 */
export function calculateDynamicLeadStatus(buyer: any): { stage: 'new' | 'partial' | 'fully_qualified'; score: number } {
    let populatedMetrics = 0;

    // Safety list of known system placeholder strings to reject from scoring points
    const blacklistedTokens = ["recommendation", "trigger_recommendation", "recommend_init", "unknown", "none", "null", "undefined", "true", "false", ""];

    function isValidDataBlock(field: any): boolean {
        if (!field || typeof field !== "string") return false;
        const cleanField = field.trim().toLowerCase();

        // Block raw execution if the string length is too short or matches a shortcut indicator keyword
        if (cleanField.length < 2) return false;
        if (blacklistedTokens.includes(cleanField)) return false;

        return true;
    }

    // Surgical verification checks validate that real customer criteria is held in memory
    if (isValidDataBlock(buyer.coreNeed)) populatedMetrics++;
    if (isValidDataBlock(buyer.budgetRange)) populatedMetrics++;
    if (isValidDataBlock(buyer.timeline)) populatedMetrics++;

    console.log(`[Metrics Engine] Active Field Count Captured: ${populatedMetrics}/3 -> B:${buyer.budgetRange} T:${buyer.timeline}`);

    if (populatedMetrics === 0) {
        return { stage: 'new', score: 20 };
    } else if (populatedMetrics < 3) {
        // Partial tracking state (missing criteria remains)
        const score = 25 + (populatedMetrics * 20); // 45 or 65
        return { stage: 'partial', score };
    } else {
        // Fully Qualified (Requires true validation across all three properties)
        return { stage: 'fully_qualified', score: 95 };
    }
}


/**
 * ─── ADAPTIVE ADAPTION PIPELINE ───
 * Merges raw intents, shadow updates, and telemetry scores directly into Sanity.
 */
// Inside processQualification in qualification.ts:

export async function processQualification(
    telegramId: string,
    intentResult: any,
    userMessage: string,
    tenantClient: any,
    tenant: TenantContext,
    existingBuyer: any
) {
    const shadowData = await shadowExtractQualification(userMessage);

    // Safety cleaning values to prevent keyword leaking
    const cleanMsg = userMessage.trim().toLowerCase();
    const containsRoutingToken = cleanMsg === "recommendation" || cleanMsg === "recommend_init";

    const mergedProfile = {
        intentType: intentResult.intent,
        // 🔄 GUARDED ASSIGNMENT: Never let background AI parse system keywords as real customer goals
        coreNeed: containsRoutingToken ? (existingBuyer?.coreNeed || "") : (shadowData?.coreNeed || existingBuyer?.coreNeed || ""),
        budgetRange: existingBuyer?.budgetRange || "",
        timeline: existingBuyer?.timeline || "",
        qualificationNotes: existingBuyer?.qualificationNotes || ""
    };

    if (shadowData?.coreNeed && !containsRoutingToken) {
        mergedProfile.qualificationNotes += `\n[Shadow AI]: ${shadowData.coreNeed} at ${new Date().toLocaleTimeString()}`;
    }

    // Re-evaluate using our new type-safe validation matrix
    const { stage, score } = calculateDynamicLeadStatus(mergedProfile);

    const updatePayload: QualificationData = {
        ...mergedProfile,
        leadScore: score,
        qualificationStage: stage,
        lastQualifiedAt: new Date().toISOString()
    };

    const savedBuyer = await updateBuyerProfile(telegramId, tenantClient, updatePayload);
    console.log(`[Adaptive Qualification][${tenant.companyName}] Buyer ${telegramId} -> Stage: ${stage} (Score: ${score})`);
    return savedBuyer || existingBuyer;
}


/**
 * ─── BILINGUAL & NICHE-ADAPTIVE KEYBOARDS ───
 * Renders fallback options matching your specific tenant's niche setup in both languages.
 */
// src/lib/qualification.ts

// src/lib/qualification.ts

export function getMissingParameterKeyboard(
    missingField: 'budgetRange' | 'timeline',
    language: 'am' | 'en',
    resolvedRule: any | null
) {
    const isAmharic = language === 'am';

    // ─── 1. RESOLVE BUDGET INTERACTIVE KEYBOARD ───
    if (missingField === 'budgetRange') {
        const defaultBudgetText = isAmharic
            ? "እባክዎ ለእርስዎ የሚስማማውን የዋጋ ክልል ይምረጡ፦"
            : "Please select a budget range that matches your current requirements:";

        // 🔄 FIXED: Dynamically pulls the dedicated custom budget override text from Sanity
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

    // ─── 2. RESOLVE TIMELINE INTERACTIVE KEYBOARD ───
    const defaultTimelineText = isAmharic
        ? "ይህን ግዢ መቼ ለመፈጸም አቅደዋል?"
        : "When are you looking to move forward with this project?";

    // 🔄 FIXED: Dynamically pulls the dedicated custom timeline override text from Sanity
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
