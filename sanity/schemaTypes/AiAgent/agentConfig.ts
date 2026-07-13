// schemaTypes/agentConfig.ts
import { defineArrayMember, defineField, defineType } from 'sanity'

export const agentConfig = defineType({
    name: 'agentConfig',
    title: 'Agent Configuration',
    type: 'document',
    fields: [
        defineField({
            name: 'name',
            title: 'Config Name',
            type: 'string',
            description: 'Human-readable name e.g. "Route A - Sales Agent"',
        }),
        defineField({
            name: 'route',
            title: 'Route',
            type: 'string',
            description: 'Which service route this config applies to',
            options: {
                list: [
                    { title: 'Route A — Structured Response', value: 'route-a' },
                    { title: 'Route B — Unstructured Response', value: 'route-b' },
                    { title: 'Route C — Unknown User Intent', value: 'route-c' },
                    { title: 'Route D — Recommendation', value: 'route-d' },
                    { title: 'Route E — Order Response', value: 'route-e' },


                ],
                layout: 'radio',
            },
        }),
        defineField({
            name: 'systemPrompt',
            title: 'System Prompt',
            type: 'text',
            description: 'The full system prompt for this agent route. use {{companyName}}, {{initialContext}}, {{languageText}}, {{slugHint}} as variables for dynamic prompt compilation',
            rows: 10,
        }), defineField({
            name: 'slugHintTemplate',
            title: 'Slug Hint Template',
            type: 'text',
            description: 'Dynamic schema lookup hint pattern. Use {{slug}} as a placeholder.',
            rows: 3,
        }),
        defineField({
            name: 'fallbackMessage',
            title: 'Fallback Message',
            type: 'string',
            description: 'What the agent says when it cannot find an answer',
        }),
        defineField({
            name: 'active',
            title: 'Active',
            type: 'boolean',
            description: 'Disable to fall back to hardcoded prompt',
            initialValue: true,
        }),

        defineField({
            name: 'enableInlineSurveyButtons',
            title: 'Enable Inline BANT Survey Buttons',
            type: 'boolean',
            description: 'Toggle on to configure interactive multi-choice survey selections for this route.',
            initialValue: false,
        }),
        defineField({
            name: 'categoryButtonMatrices',
            title: 'Category-Linked Budget Ranges',
            type: 'array',
            description: 'Define specific multi-choice inline buttons mapped to different catalog category themes.',
            hidden: ({ document }) => !document?.enableInlineSurveyButtons, // 🟢 Hides the options on unrelated paths automatically!
            of: [
                defineArrayMember({
                    type: 'object',
                    name: 'categoryMatrix',
                    fields: [
                        defineField({
                            name: 'categoryReferenceValue',
                            title: 'Target Category Match Key',
                            type: 'string',
                            description: 'The core category token string this matrix handles (e.g., "tours", "laptops").',
                        }),
                        defineField({
                            name: 'surveyInstructionTextEnglish',
                            title: 'Survey Message (English)',
                            type: 'string',
                            initialValue: 'Please select your preferred Purchase Budget Range from the options below:',
                        }),
                        defineField({
                            name: 'surveyInstructionTextAmharic',
                            title: 'Survey Message (Amharic)',
                            type: 'string',
                            initialValue: 'እባክዎ መጀመሪያ የምርት በጀትዎን ከታች ካሉት አማራጮች ይምረጡ፦',
                        }),
                        defineField({
                            name: 'buttons',
                            title: 'Inline Budget Buttons Configuration Rows',
                            type: 'array',
                            of: [
                                defineArrayMember({
                                    type: 'object',
                                    fields: [
                                        defineField({ name: 'labelEnglish', title: 'Button Label (English)', type: 'string' }),
                                        defineField({ name: 'labelAmharic', title: 'Button Label (Amharic)', type: 'string' }),
                                        defineField({
                                            name: 'callbackValue',
                                            title: 'Callback Value Key',
                                            type: 'string',
                                            description: 'Saved inside Redis/Sanity context (e.g., "budget_50k_100k", "budget_premium").'
                                        }),
                                    ]
                                })
                            ]
                        })
                    ]
                })
            ]
        })
    ],
    preview: {
        select: {
            title: 'name',
            subtitle: 'route',
        },
    },
})
