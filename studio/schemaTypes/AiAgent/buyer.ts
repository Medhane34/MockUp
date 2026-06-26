import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'buyer',
    title: 'Buyer / Lead',
    type: 'document',
    fields: [
        // defineField({ name: 'telegramId', title: 'Telegram ID', type: 'string', validation: Rule => Rule.required() }),

        defineField({ name: 'telegramId', type: 'string', validation: Rule => Rule.required() }),
        defineField({ name: 'username', type: 'string' }),
        defineField({ name: 'firstName', type: 'string' }),
        defineField({ name: 'phone', type: 'string', description: 'Phone number shared via Telegram contact' }),
        defineField({ name: 'preferredLanguage', type: 'string', options: { list: ['en', 'am'] } }),
        defineField({ name: 'status', type: 'string', initialValue: 'raw', options: { list: ['raw', 'new', 'qualified', 'quoted', 'customer', 'lost'] } }),
        defineField({ name: 'interests', type: 'array', of: [{ type: 'string' }] }),
        defineField({ name: 'firstInteraction', type: 'datetime' }),
        defineField({ name: 'lastInteraction', type: 'datetime' }),
        defineField({ name: 'totalMessages', type: 'number', initialValue: 0 }),
        defineField({ name: 'onboardingStep', type: 'string' }),   // e.g., "welcome", "name", "phone", "completed"

        defineField({
            name: 'leadScore',
            title: 'Lead Score',
            type: 'number',
            initialValue: 0,
        }),

    ],
});