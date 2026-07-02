// src/lib/checkout.ts
import crypto from "crypto";

export interface CheckoutSessionPayload {
    sessionToken: string;
    tenantId: string;
    telegramId: string;
    productSku: string;
    productName: string;
    productId: string;
    status: 'pending_payment' | 'verified_paid' | 'failed';
    createdAt: string;
}

/**
 * 🟢 DYNAMIC TOKEN GENERATOR
 * Compiles a completely unique, secure, ephemeral random token tracking sequence
 */
export function generateCheckoutSessionToken(telegramId: string, productSku: string): string {
    const salt = crypto.randomBytes(16).toString("hex");

    // Create an un-guessable unique hash combining user identity and chronological tickers
    return crypto
        .createHash("sha256")
        .update(`${telegramId}-${productSku}-${salt}-${Date.now()}`)
        .digest("hex")
        .substring(0, 32); // Returns a clean 32-character tracking code
}
// Add this helper function directly to your src/lib/checkout.ts file

/**
 * 🟢 REDIS POLLING VALIDATOR
 * Queries a tenant's isolated Redis cache instance to check real-time settlement status.
 */
export async function checkPaymentStatus(
    tenantRedis: any,
    telegramId: string,
    productSku: string
): Promise<{ verified: boolean; data: any | null }> {
    const sessionCacheKey = `checkout:session:${telegramId}:${productSku.trim().toLowerCase()}`;

    try {
        const cachedData = await tenantRedis.get(sessionCacheKey);
        if (!cachedData) {
            return { verified: false, data: null };
        }

        // Parse the payload object safely from cache string tokens
        const payload = typeof cachedData === "string" ? JSON.parse(cachedData) : cachedData;

        // Match against our successful webhook signature state flag
        if (payload?.paymentStatus === "VERIFIED_PAID") {
            return { verified: true, data: payload };
        }

        return { verified: false, data: payload };
    } catch (err) {
        console.error(`[Polling Validator] Exception checking Redis token cache for user ${telegramId}:`, err);
        return { verified: false, data: null };
    }
}
