import { defineType, defineField } from 'sanity';

export default defineType({
    name: 'product',
    title: 'Product',
    type: 'document',
    fields: [
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
        defineField({
            name: 'category',
            title: 'Category',
            type: 'string',
            options: {
                list: [
                    { title: 'Electronics', value: 'electronics' },
                    { title: 'Fashion', value: 'fashion' },
                    { title: 'Home & Kitchen', value: 'home' },
                    { title: 'Beauty', value: 'beauty' },
                    { title: 'Agriculture', value: 'agriculture' },
                ],
            },
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