import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'product',
    title: 'Product',
    type: 'document',
    fields: [
        defineField({
            name: 'ProductSku',
            title: 'Product SKU / Inventory ID',
            type: 'string',
            description: 'Enter the unique warehouse catalog SKU or item model code (e.g., sam-a35-256gb).',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'name',
            title: 'Product Name',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'slug',
            title: 'Slug',
            type: 'slug',
            options: { source: 'name' },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'price',
            title: 'Price (ETB)',
            type: 'number',
            validation: (Rule) => Rule.required().min(0),
        }),
        // Update the category field definition inside your product.ts schema file:

        defineField({
            name: 'categoryRef',
            title: 'Product Category Reference',
            type: 'reference',
            to: [{ type: 'category' }], // Relational target binding
            description: 'Select the primary categorical group that this inventory item belongs to.',
            validation: (Rule) => Rule.required(),
        }),

        defineField({
            name: 'description',
            title: 'Description',
            type: 'text',
        }),
        defineField({
            name: 'features',
            title: 'Key Features',
            type: 'array',
            of: [{ type: 'string' }],
        }),
        defineField({
            name: 'image',
            title: 'Main Image',
            type: 'image',
            options: { hotspot: true },
        }),
        defineField({
            name: 'inStock',
            title: 'In Stock',
            type: 'boolean',
            initialValue: true,
        }),
        defineField({
            name: 'stockQuantity',
            title: 'Stock Quantity',
            type: 'number',
            initialValue: 50,
        }),
    ],
});