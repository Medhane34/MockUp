// src/lib/buyer.ts

import { client } from "@/sanity/client";

export async function getBuyer(telegramId: string) {
    const query = `*[_type == "buyer" && telegramId == $telegramId][0]`;
    return client.fetch(query, { telegramId });
}

export async function createOrUpdateBuyer(telegramId: string, data: any) {
    const existing = await getBuyer(telegramId);

    if (existing) {
        // Patch only changed fields - optimized
        return client.patch(existing._id).set(data).commit();
    } else {
        return client.create({
            _type: 'buyer',
            telegramId,
            firstInteraction: new Date().toISOString(),
            status: 'raw',
            totalMessages: 1,
            ...data,
        });
    }
}

export async function updateBuyerInteraction(telegramId: string, extraData: any = {}) {
    const buyer = await getBuyer(telegramId);
    if (!buyer) return null;

    return client.patch(buyer._id).set({
        lastInteraction: new Date().toISOString(),
        totalMessages: (buyer.totalMessages || 0) + 1,
        ...extraData,
    }).commit();
}