import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'buyer',
    title: 'Buyer / Lead',
    type: 'document',
    fields: [
        defineField({ name: 'telegramId', title: 'Telegram ID', type: 'string', validation: Rule => Rule.required() }),
        defineField({ name: 'name', title: 'Name', type: 'string' }),
        defineField({ name: 'phone', title: 'Phone', type: 'string' }),
        defineField({ name: 'email', title: 'Email', type: 'string' }),
        defineField({
            name: 'leadScore',
            title: 'Lead Score',
            type: 'number',
            initialValue: 0,
        }),
        defineField({
            name: 'status',
            title: 'Status',
            type: 'string',
            options: { list: ['new', 'qualified', 'quoted', 'customer', 'lost'] },
            initialValue: 'new',
        }),
        defineField({
            name: 'lastInteraction',
            title: 'Last Interaction',
            type: 'datetime',
        }),
    ],
});