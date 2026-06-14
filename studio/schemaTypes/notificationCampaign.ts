import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'notificationCampaign',
    title: 'Notification Campaign',
    type: 'document',
    fields: [
        defineField({ name: 'title', type: 'string', title: 'Notification Title', validation: Rule => Rule.max(40) }),
        defineField({
            name: 'body',
            type: 'array',
            title: 'Body Content',
            of: [{ type: 'block' }, { type: 'image' }]
        }),
        defineField({ name: 'targetUrl', type: 'url', title: 'Click-through URL' }),
        defineField({ name: 'sendAt', type: 'datetime', title: 'Scheduled Send Time' }),
    ],
});