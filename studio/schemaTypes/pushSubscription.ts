import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'pushSubscription',
    title: 'Push Subscription',
    type: 'document',
    fields: [
        defineField({ name: 'endpoint', type: 'string', title: 'Endpoint' }),
        defineField({
            name: 'keys', type: 'object', title: 'Keys', fields: [
                { name: 'p256dh', type: 'string' },
                { name: 'auth', type: 'string' }
            ]
        }),
        defineField({ name: 'userAgent', type: 'string', title: 'User Agent' }),
    ],
});