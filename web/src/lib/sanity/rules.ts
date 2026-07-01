// src/lib/sanity/rules.ts
import type { SanityClient } from "next-sanity";

export interface CustomRuleButton {
    buttonLabelEn: string;
    buttonLabelAm: string;
    callbackValue: string;
}

export interface QualificationRuleResponse {
    ruleName: string;
    triggerType: string;
    targetValue?: string;
    customBudgetPromptEn?: string;
    customBudgetPromptAm?: string;
    customTimelinePromptEn?: string;
    customTimelinePromptAm?: string;
    disqualificationBudgetKey?: string;
    customDisqualifiedPromptEn?: string;
    customDisqualifiedPromptAm?: string;
    customBudgetOptions?: CustomRuleButton[];
    customTimelineOptions?: CustomRuleButton[];
}

/**
 * Dynamically resolves the absolute highest priority qualification rules ruleset for a specific context.
 * Evaluates category overrides first, falls back to intent rules, and drops to global defaults if empty.
 *
 * @param tenantClient - The pre-built cached Sanity client instance for the active tenant
 * @param category - The current product category the user is browsing (optional)
 * @param intent - The detected user conversation intent (optional)
 */
export async function getAdaptiveQualificationRule(
    tenantClient: SanityClient,
    category?: string,
    intent?: string
): Promise<QualificationRuleResponse | null> {

    // Optimized GROQ Query evaluating absolute priority across multi-trigger matching profiles
    // Inside getAdaptiveQualificationRule query inside rules.ts:
    // Performs an inner join mapping targetCategoryReference->slug.current matching the turn context string
    const query = `*[_type == "qualificationRules" && (
        (triggerType == "category" && targetCategoryReference->slug.current == $category) ||
        (triggerType == "intent" && targetValue == $intent) ||
        (triggerType == "global")
    )] | order(priority desc)[0]{
        ruleName,
        triggerType,
        targetValue,
        customBudgetPromptEn,
        customBudgetPromptAm,
        customTimelinePromptEn,
        customTimelinePromptAm,
        disqualificationBudgetKey,
        customDisqualifiedPromptEn,
        customDisqualifiedPromptAm,
        customBudgetOptions,
        customTimelineOptions
    }`;


    try {
        const cleanCategory = category ? category.trim().toLowerCase() : "";
        const cleanIntent = intent ? intent.trim() : "";

        console.log(`[Rules Engine] Querying reference matrix for Cat: "${cleanCategory}", Intent: "${cleanIntent}"`);

        const activeRule = await tenantClient.fetch(query, {
            category: cleanCategory,
            intent: cleanIntent
        });

        if (activeRule) {
            console.log(`[Rules Engine] Successfully resolved referenced ruleset document: "${activeRule.ruleName}"`);
        } else {
            console.log(`[Rules Engine] No rulesets found. Chatbot falling back to native code presets.`);
        }

        return activeRule || null;
    } catch (err) {
        console.error("[Rules Engine] Reference query lookup crash failed:", err);
        return null;
    }
}