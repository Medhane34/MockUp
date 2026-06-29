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

    const query = `*[_type == "qualificationRules" && (
    (triggerType == "category" && targetValue == $category) ||
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
    customBudgetOptions,
    customTimelineOptions
}`;


    try {
        const activeRule = await tenantClient.fetch(query, {
            category: category || "",
            intent: intent || ""
        });

        if (activeRule) {
            console.log(`[Rules Engine] Resolved active configuration: "${activeRule.ruleName}"`);
        }
        return activeRule || null;
    } catch (err) {
        console.error("[Rules Engine] Failed to fetch dynamic configurations:", err);
        return null;
    }
}
