// studio/schemaTypes/AiAgent/tenant.ts
export default {
    name: 'tenant',
    title: 'Tenant Configuration',
    type: 'document',
    fields: [
        // ─── 1. Identity & Routing ───────────────────────────────────────────────
        {
            name: 'companyName',
            title: 'Company Name',
            type: 'string',
            validation: (Rule: any) => Rule.required(),
        },
        {
            name: 'subdomain',
            title: 'Assigned Subdomain',
            type: 'slug',
            description: 'The prefix identifier (e.g., "aligoo" for aligoo.yourplatform.com)',
            options: { source: 'companyName' },
            validation: (Rule: any) => Rule.required(),
        },
        {
            name: 'niche',
            title: 'Business Niche',
            type: 'string',
            options: {
                list: [
                    { title: 'E-commerce', value: 'ecommerce' },
                    { title: 'Service / Booking', value: 'services' },
                    { title: 'Travel Agency', value: 'travel' },
                ],
            },
            validation: (Rule: any) => Rule.required(),
        },

        // ─── 2. Support & Branding ───────────────────────────────────────────────
        {
            name: 'supportHandle',
            title: 'Support Handle',
            type: 'string',
            description: 'Telegram handle or contact used in AI responses (e.g., "@aligoo_support")',
            validation: (Rule: any) => Rule.required(),
        },
        { name: 'logo', type: 'image' },
        { name: 'primaryColor', title: 'Primary Color', type: 'string', description: 'Hex color code (e.g., #3B82F6)' },

        // ─── 3. Telegram Bot Credentials ────────────────────────────────────────
        {
            name: 'telegramBotToken',
            title: 'Telegram Bot Token',
            type: 'string',
            description: 'The secret HTTP API token provided by BotFather',
        },
        {
            name: 'telegramWebhookSecret',
            title: 'Telegram Webhook Secret Token',
            type: 'string',
            description: 'Used to validate incoming x-telegram-bot-api-secret-token headers from Telegram',
        },

        // ─── 4. Webhook Registration Status ─────────────────────────────────────
        {
            name: 'webhookRegistered',
            title: 'Webhook Registered',
            type: 'boolean',
            description: 'Whether the Telegram webhook has been successfully registered for this tenant',
            initialValue: false,
        },
        {
            name: 'webhookUrl',
            title: 'Webhook URL',
            type: 'string',
            description: 'The full Vercel webhook endpoint URL for this tenant',
        },

        // ─── 5. AI Directives & Personalization ─────────────────────────────────
        {
            name: 'systemPrompt',
            title: 'AI Persona System Prompt',
            type: 'text',
            description: 'Optional override: the core rules, constraints, and operational persona for the AI. Leave blank to use the auto-generated niche-based prompt.',
        },
        {
            name: 'conversionGoalDescription',
            title: 'Conversion Goal Description',
            type: 'string',
            description: 'Tell the AI what the final goal is (e.g., "Get them to fill the booking link", "Add items to cart")',
        },

        // ─── 6. Tenant Sanity.io Project (Data Isolation) ───────────────────────
        {
            name: 'projectId',
            title: 'Sanity Project ID',
            type: 'string',
            description: 'Sanity.io Project ID for this tenant\'s isolated data project',
            validation: (Rule: any) => Rule.required(),
        },
        {
            name: 'dataset',
            title: 'Sanity Dataset',
            type: 'string',
            description: 'Sanity.io dataset name (usually "production")',
            initialValue: 'production',
        },
        {
            name: 'sanityApiToken',
            title: 'Sanity API Token',
            type: 'string',
            description: 'Read/write token for this tenant\'s Sanity project. Also stored as a Vercel environment variable for security. Update here when rotating tokens.',
        },
        {
            name: 'sanityWebhookSecret',
            title: 'Sanity Webhook Secret',
            type: 'string',
            description: 'Secret to validate incoming webhooks from this tenant\'s Sanity project',
        },

        // ─── 7. Limits & Billing ────────────────────────────────────────────────
        {
            name: 'status',
            title: 'Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Active', value: 'active' },
                    { title: 'Trial', value: 'trial' },
                    { title: 'Suspended', value: 'suspended' },
                ],
            },
            initialValue: 'trial',
            validation: (Rule: any) => Rule.required(),
        },
        {
            name: 'dailyMessageLimit',
            title: 'Daily Message Limit',
            type: 'number',
            initialValue: 1000,
            description: 'Maximum AI messages allowed per day across all users of this tenant',
        },
        {
            name: 'monthlyMessageCount',
            title: 'Monthly Message Count',
            type: 'number',
            initialValue: 0,
            description: 'Running total of AI messages sent this billing period (reset on lastResetAt)',
            readOnly: () => true,
        },
        {
            name: 'lastResetAt',
            title: 'Last Billing Reset',
            type: 'datetime',
            description: 'Timestamp of the last monthly counter reset',
            readOnly: () => true,
        },
    ],
};