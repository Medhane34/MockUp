// src/schemas/buyer.ts

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
        // New fields for Qualification System

        {
            name: 'qualificationStage',
            title: 'Qualification Stage',
            type: 'string',
            options: {
                list: [
                    { title: 'New', value: 'new' },
                    { title: 'Intent Captured', value: 'intent' },
                    { title: 'Needs Identified', value: 'needs' },
                    { title: 'Qualified', value: 'qualified' },
                    { title: 'Quoted', value: 'quoted' },
                    { title: 'Customer', value: 'customer' },
                    { title: 'Lost', value: 'lost' },
                ],
            },
            initialValue: 'new',
        },
        {
            name: 'intentType',
            title: 'Detected Intent',
            type: 'string',
        },
        {
            name: 'coreNeed',
            title: 'Core Need / Pain Point',
            type: 'text',
        },
        {
            name: 'budgetRange',
            title: 'Budget Range (ETB)',
            type: 'string',
        },
        {
            name: 'timeline',
            title: 'Purchase Timeline',
            type: 'string',
            options: {
                list: ['Immediate', 'This Week', 'This Month', 'Exploring'],
            },
        },
        {
            name: 'qualificationNotes',
            title: 'AI Qualification Notes',
            type: 'text',
        },
        {
            name: 'lastQualifiedAt',
            title: 'Last Qualified At',
            type: 'datetime',
        },
    ],
});