// src/schemas/AiAgent/category.ts
import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'category',
    title: 'Product/Service Category',
    type: 'document',
    fields: [
        defineField({
            name: 'title',
            title: 'Category Title (English)',
            type: 'string',
            description: 'The standard display name used in English flows (e.g., "Electronics", "Tour Packages").',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'titleAm',
            title: 'Category Title (Amharic - ፊደል)',
            type: 'string',
            description: 'The category name rendered in Amharic script (e.g., "ኤሌክትሮኒክስ", "የጉዞ ፓኬጆች").',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Category Target Slug Identifier',
            type: 'slug',
            description: 'The machine identifier string token used to pair data loops behind the scenes (e.g., "electronics", "travel").',
            options: {
                source: 'title',
                maxLength: 96,
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
            description: 'Brief overview details describing this group bracket.',
        }),
    ],
});
