// sanity/schemas/pwaInteraction.ts
import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'pwaInteraction',
    title: 'PWA Interaction',
    type: 'document',
    fields: [
        defineField({
            name: 'userId',
            title: 'User ID (Anonymous)',
            type: 'string',
            description: 'An anonymous ID to track interactions without storing PII.',
        }),
        defineField({
            name: 'action',
            title: 'Action',
            type: 'string',
            options: {
                list: [
                    { title: 'Installed', value: 'installed' },
                    { title: 'Prompt Shown', value: 'prompt_shown' },
                    { title: 'Prompt Accepted', value: 'prompt_accepted' },
                    { title: 'Prompt Dismissed', value: 'prompt_dismissed' },
                ],
            },
        }),
        defineField({
            name: 'source',
            title: 'Source',
            type: 'string',
            options: {
                list: [
                    { title: 'Homepage', value: 'homepage' },
                    { title: 'Blog', value: 'blog' },
                ],
            },
        }),
        defineField({
            name: 'device',
            title: 'Device',
            type: 'string',
        }),
        defineField({
            name: 'timestamp',
            title: 'Timestamp',
            type: 'datetime',
            initialValue: () => new Date().toISOString(),
        }),
    ],
});

