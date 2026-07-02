// src/schemas/qualificationRules.ts
import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'qualificationRules',
    title: 'AI Qualification Rule Configuration',
    type: 'document',
    groups: [
        { name: "en", title: "English", default: true },
        { name: "am", title: "አማርኛ" },
    ],
    fields: [
        defineField({
            name: 'ruleName',
            title: 'Rule Configuration Name',
            type: 'string',
            description: 'Internal descriptive name for this routing ruleset (e.g., "Premium Coffee Machine Budgets" or "Travel Package Steps").',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'triggerType',
            title: 'Activation Trigger Type',
            type: 'string',
            options: {
                list: [
                    { title: 'Global Default (Applies if no category matches)', value: 'global' },
                    { title: 'Product Category Specific', value: 'category' },
                    { title: 'Intent Type Specific', value: 'intent' },
                ],
            },
            initialValue: 'global',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'targetCategoryReference',
            title: 'Target Reference Product Category',
            type: 'reference',
            description: 'Select the exact live category document that activates this rule setup block.',
            to: [{ type: 'category' }], // Restricts lookup strictly to your new category document items
            hidden: ({ document }) => document?.triggerType !== 'category',
        }),
        defineField({
            name: 'priority',
            title: 'Rule Priority Sorting Weight',
            type: 'number',
            description: 'Higher numbers run first if multiple category or intent rules conflict at runtime.',
            initialValue: 0,
        }),

        // ─── CUSTOM ADAPTIVE BUDGET STEPS SECTION ──────────────────────────────────
        defineField({
            name: 'customBudgetOptions',
            title: 'Custom Budget Range Interactive Buttons',
            type: 'array',
            description: 'Define the custom price options to render for this specific category or intent.',
            of: [
                {
                    type: 'object',
                    name: 'budgetOption',
                    title: 'Budget Option Button configuration',
                    fields: [
                        { name: 'buttonLabelEn', title: 'Button Label (English)', type: 'string', validation: (Rule) => Rule.required() },
                        { name: 'buttonLabelAm', title: 'Button Label (Amharic - ፊደል)', type: 'string', validation: (Rule) => Rule.required() },
                        {
                            name: 'callbackValue',
                            title: 'Backend Database Value Code',
                            type: 'string',
                            description: 'The clean string text saved to the database (e.g., "under_50k", "premium_tier"). Do not include spaces.',
                            validation: (Rule) => Rule.required()
                        },
                    ]
                }
            ]
        }),

        // ─── CUSTOM ADAPTIVE TIMELINE STEPS SECTION ────────────────────────────────
        defineField({
            name: 'customTimelineOptions',
            title: 'Custom Timeline Urgency Interactive Buttons',
            type: 'array',
            description: 'Define custom chronological milestones if default ("Immediate", "30 Days") does not match this niche.',
            of: [
                {
                    type: 'object',
                    name: 'timelineOption',
                    title: 'Timeline Option Button configuration',
                    fields: [
                        { name: 'buttonLabelEn', title: 'Button Label (English)', type: 'string', validation: (Rule) => Rule.required() },
                        { name: 'buttonLabelAm', title: 'Button Label (Amharic - ፊደል)', type: 'string', validation: (Rule) => Rule.required() },
                        {
                            name: 'callbackValue',
                            title: 'Backend Database Value Code',
                            type: 'string',
                            description: 'The value string saved to Sanity (e.g., "immediate", "next_season").',
                            validation: (Rule) => Rule.required()
                        },
                    ]
                }
            ]
        }),

        // ─── DYNAMIC CONVERSATIONAL AI TRANSITION TEXTS ────────────────────────────
        defineField({
            name: 'customPromptEn',
            title: 'Custom Question Prompt Text (English)',
            group: "en",
            type: 'text',
            description: 'Override string what the bot says when popping up the budget panel (e.g., "What is your commercial setup budget capacity?").',
        }),
        defineField({
            name: 'customPromptAm',
            title: 'Custom Question Prompt Text (Amharic - ፊደል)',
            group: "am",
            type: 'text',
            description: 'Override prompt text in Amharic script (e.g., "እባክዎ ለንግድዎ ያቀዱትን የበጀት መጠን ይምረጡ፦").',
        }),

        // ─── DYNAMIC CONVERSATIONAL TIMELINE PROMPTS ──────────────────────────
        defineField({
            name: 'customTimelinePromptEn',
            title: 'Custom Timeline Question Prompt (English)',
            group: "en",
            type: 'text',
            description: 'What the bot says when popping up the timeline panel (e.g., "When do you need this equipment delivered?").',
        }),
        defineField({
            name: 'customTimelinePromptAm',
            title: 'Custom Timeline Question Prompt (Amharic - ፊደል)',
            group: "am",
            type: 'text',
            description: 'Timeline prompt text in Amharic script (e.g., "ይህን ማሽን መቼ ለመረከብ አቅደዋል?").',
        }),
        // Add these fields inside the fields array of your qualificationRules schema file

        // ─── CUSTOM DISQUALIFICATION PARAMETERS (CATEGORY LEVEL) ──────────────────
        defineField({
            name: 'disqualificationBudgetKey',
            title: 'Disqualification Budget Key Threshold',
            type: 'string',
            description: 'Enter the exact callback value string that triggers automated disqualification for this category (e.g., "under_50k"). If a user selects this option, they are instantly flagged as disqualified.',
        }),
        defineField({
            name: 'customDisqualifiedPromptEn',
            title: 'Polite Disqualification Text (English)',
            type: 'text',
            description: 'The fallback copy the chatbot says to a disqualified user in English before stopping the sales tracking tunnel.',
        }),
        defineField({
            name: 'customDisqualifiedPromptAm',
            title: 'Polite Disqualification Text (Amharic - ፊደል)',
            type: 'text',
            description: 'The fallback copy the chatbot says to a disqualified user in Amharic script.',
        }),


    ],
});
