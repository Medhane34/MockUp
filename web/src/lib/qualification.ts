// src/lib/qualification.ts
import { generateObject } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import { updateBuyerProfile } from './sanity/buyer';
import type { TenantContext } from '@/types/tenant';
import { google } from "@ai-sdk/google"; // 🟢 Restored native type-safe provider import

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
 * ─── SHADOW AI EXTRACTION WORKER ───
 * Runs in the background to seamlessly extract BANT parameters without user friction.
 */
export async function shadowExtractQualification(userMessage: string): Promise<any> {
    try {
        const { object } = await generateObject({
            model: google("gemini-2.5-flash"),
            schema: z.object({
                coreNeed: z.string().optional().describe("Clean extracted summary of what specific item/service they are seeking (e.g. 'video editing laptop', 'wedding outfit'). Leave blank if they just said hello or generic phrases."),
                budgetRange: z.enum(['<5k', '5k-20k', '>20k']).optional().describe("Inferred budget category based on context cues."),
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
export function calculateDynamicLeadStatus(buyer: any): { stage: 'new' | 'partial' | 'fully_qualified'; score: number } {
    let populatedMetrics = 0;

    if (buyer.coreNeed && buyer.coreNeed.trim() !== "") populatedMetrics++;
    if (buyer.budgetRange && buyer.budgetRange.trim() !== "") populatedMetrics++;
    if (buyer.timeline && buyer.timeline.trim() !== "") populatedMetrics++;

    if (populatedMetrics === 0) {
        return { stage: 'new', score: 20 };
    } else if (populatedMetrics < 3) {
        // Partial tracking state (Missing 1 or 2 core criteria markers)
        const score = 25 + (populatedMetrics * 20); // Evaluates to 45 or 65
        return { stage: 'partial', score };
    } else {
        // Fully Qualified (Core Need AND Budget AND Timeline secured)
        return { stage: 'fully_qualified', score: 95 };
    }
}

/**
 * ─── ADAPTIVE ADAPTION PIPELINE ───
 * Merges raw intents, shadow updates, and telemetry scores directly into Sanity.
 */
export async function processQualification(
    telegramId: string,
    intentResult: any,
    userMessage: string,
    tenantClient: any,
    tenant: TenantContext,
    existingBuyer: any
) {
    // 1. Fire off the Shadow AI extractor utility
    const shadowData = await shadowExtractQualification(userMessage);

    // 2. Build the prospective data merge block
    const mergedProfile = {
        intentType: intentResult.intent,
        coreNeed: shadowData?.coreNeed || existingBuyer?.coreNeed || "",
        budgetRange: shadowData?.budgetRange || existingBuyer?.budgetRange || "",
        timeline: shadowData?.timeline || existingBuyer?.timeline || "",
        qualificationNotes: existingBuyer?.qualificationNotes || ""
    };

    if (shadowData?.coreNeed) {
        mergedProfile.qualificationNotes += `\n[Shadow AI Extracted Need]: ${shadowData.coreNeed} at ${new Date().toLocaleTimeString()}`;
    }

    // 3. Compute systems-level metrics based on the cumulative dataset fields
    const { stage, score } = calculateDynamicLeadStatus(mergedProfile);

    const updatePayload: QualificationData = {
        ...mergedProfile,
        leadScore: score,
        qualificationStage: stage,
        lastQualifiedAt: new Date().toISOString()
    };

    // 4. Commit mutations to Sanity via the type-guarded patch engine
    const savedBuyer = await updateBuyerProfile(telegramId, tenantClient, updatePayload);

    console.log(`[Adaptive Qualification][${tenant.companyName}] Buyer ${telegramId} -> Stage: ${stage} (Score: ${score})`);

    return savedBuyer || existingBuyer;
}

/**
 * ─── BILINGUAL & NICHE-ADAPTIVE KEYBOARDS ───
 * Renders fallback options matching your specific tenant's niche setup in both languages.
 */
export function getMissingParameterKeyboard(missingField: 'budgetRange' | 'timeline', language: 'am' | 'en') {
    if (missingField === 'budgetRange') {
        return {
            text: language === 'am'
                ? "እባክዎ ለእርስዎ የሚስማማውን የዋጋ ክልል ይምረጡ፦"
                : "Please select a budget range that matches your current planning requirements:",
            replyMarkup: {
                inline_keyboard: [
                    [
                        { text: language === 'am' ? "ከ 5k በታች" : "< 5,000 ETB", callback_data: "budget_<5k" },
                        { text: "5k - 20k ETB", callback_data: "budget_5k-20k" },
                        { text: language === 'am' ? "ከ 20k በላይ" : "> 20k ETB", callback_data: "budget_>20k" }
                    ]
                ]
            }
        };
    }

    // Timeline Keyboard Generation Branch
    return {
        text: language === 'am'
            ? "ይህን ምርት/አገልግሎት መቼ ለማግኘት አቅደዋል?"
            : "When are you looking to move forward with this purchase/booking?",
        replyMarkup: {
            inline_keyboard: [
                [
                    { text: language === 'am' ? "በአስቸኳይ" : "Immediate", callback_data: "timeline_immediate" },
                    { text: language === 'am' ? "በ30 ቀናት ውስጥ" : "Within 30 Days", callback_data: "timeline_30_days" },
                    { text: language === 'am' ? "ለማየት ብቻ" : "Exploring", callback_data: "timeline_exploring" }
                ]
            ]
        }
    };
}
