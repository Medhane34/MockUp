// src/schemas/transaction.ts
import { defineField, defineType } from 'sanity';

export default defineType({
    name: 'transaction',
    title: 'Financial Payment Transaction',
    type: 'document',
    fields: [
        defineField({
            name: 'tenantId',
            title: 'Tenant ID Identifier',
            type: 'string',
            description: 'The strict multi-tenant owner code reference matching the store instance.',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'telegramId',
            title: 'Buyer Telegram ID',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'buyerPhone',
            title: 'Buyer Phone Number',
            type: 'string',
            description: 'The phone number collected from the user profile stock to verify and identify the buyer during fulfillment checking.',
        }),
        defineField({
            name: 'orderRef',
            title: 'Internal Order Reference Tracking Code',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'gatewayTransactionId',
            title: 'Official Gateway Network Tracking ID',
            type: 'string',
            description: 'The cryptographic network reference returned by Chapa or Telebirr (e.g. outTradeNo or transactionNo).',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'gatewayUsed',
            title: 'Payment Gateway Provider',
            type: 'string',
            options: {
                list: [
                    { title: 'Chapa Gateway', value: 'chapa' },
                    { title: 'Telebirr Gateway', value: 'telebirr' },
                    { title: 'Sandbox Mock Simulator', value: 'chapa_mock' }
                ]
            },
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'productId',
            title: 'Custom Product ID / SKU',
            type: 'string',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'productName',
            title: 'Product Display Name',
            type: 'string',
        }),
        defineField({
            name: 'productSlug',
            title: 'Product Slug String',
            type: 'string',
        }),
        defineField({
            name: 'amountPaid',
            title: 'Total Amount Settled',
            type: 'number',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'currency',
            title: 'Settlement Currency',
            type: 'string',
            initialValue: 'ETB',
        }),
        defineField({
            name: 'paymentStatus',
            title: 'Payment Verification Status',
            type: 'string',
            initialValue: 'VERIFIED_PAID',
        }),
        defineField({
            name: 'fulfillmentStatus',
            title: 'Order Fulfillment Status',
            type: 'string',
            options: {
                list: [
                    { title: 'Pending Shipping / Verification 🚚', value: 'pending_shipping' },
                    { title: 'Dispatched / In Transit 📦', value: 'shipped' },
                    { title: 'Delivered Successfully 🏁', value: 'delivered' }
                ]
            },
            initialValue: 'pending_shipping',
            validation: (Rule) => Rule.required(),
        }),
        defineField({
            name: 'capturedAt',
            title: 'Transaction Capture Precise Date Time',
            type: 'datetime',
            validation: (Rule) => Rule.required(),
        })
    ]
});
