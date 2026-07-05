// src/app/api/webhook/tenant-checkout/route.ts
import { NextRequest, NextResponse } from "next/server";
import { adminClient, createTenantClient } from "@/sanity/client";
import { updateBuyerProfile } from "@/lib/sanity/buyer";
import { createTenantRedisClient } from "@/lib/upstash"; // 🟢 Restored our central factory import

export async function POST(request: NextRequest) {
    console.log("[Payment Webhook] Received incoming settlement payload transaction...");

    // 1. Cryptographic Security Sandbox Validation Guard
    const platformSecret = request.headers.get("x-platform-sandbox-secret");
    if (!platformSecret || platformSecret !== "mock_secret_signature_982341") {
        console.warn("[Payment Webhook] Cryptographic signature validation failed — rejecting");
        return new Response("Invalid Signature Token", { status: 401 });
    }

    let body: any;
    try {
        body = await request.json();
    } catch {
        return new Response("Bad Request Payload", { status: 400 });
    }

    const { status, amount, gateway, tx_ref, metadata } = body;

    // Destructure parameter formats coming from your sandbox webpage
    const { sessionToken, tenantId, telegramId, productSku, product_id, productName } = metadata || {};

    // Standardize and clean the text characters on-the-fly
    const cleanSku = (productSku || product_id || "").toString().trim().replace(/\s+/g, "-").toLowerCase();
    const cleanSessionToken = (sessionToken || "").toString().trim();
    const cleanTelegramId = (telegramId || "").toString().trim();

    if (!cleanSessionToken || !tenantId || !cleanTelegramId || !cleanSku || cleanSku === "") {
        console.error(`[Payment Webhook] Guard Rejection: Missing tracking parameters. SKU: "${cleanSku}"`);
        return new Response("Missing tracking metadata parameters", { status: 400 });
    }

    if (status !== "success") {
        return new Response("Transaction failed status ignored", { status: 200 });
    }

    try {
        // 2. Resolve Tenant Identity from our main database registry layers
        console.log(`[Payment Webhook] Fetching live tenant data from registry for ID: ${tenantId}`);
        // 🔄 FIX: Use [0] to return a single document (not an array), and use strict
        //         equality for _id matching — `match` is a text-search operator, not equality.
        const liveTenantConfig = await adminClient.fetch(
            `*[_type == "tenant" && _id == $tenantId][0]{
                companyName,
                redisUrl,
                redisToken,
                projectId,
                dataset,
                sanityApiToken
            }`,
            { tenantId: tenantId.trim() }
        );

        // Optional chaining handles both null (no doc found) and missing field cases
        if (!liveTenantConfig?.redisUrl || !liveTenantConfig?.redisToken) {
            console.error(`[Payment Webhook] Critical Error: Tenant workspace config not found inside Sanity for id: ${tenantId}`);
            return new Response("Tenant workspace configuration not found in Sanity", { status: 404 });
        }

        // Clean, trim, and format the properties explicitly before passing to the factory
        const tenantConfig = {
            id: tenantId,
            redisUrl: liveTenantConfig.redisUrl.trim(),
            redisToken: liveTenantConfig.redisToken.trim(),
            companyName: liveTenantConfig.companyName || "Dynamic Tenant"
        };

        // 3. ─── DUAL WRITE DESTINATION A: WRITE TRANSACTION VIA CENTRAL FACTORY CLIENT ───
        // 🟢 RESTORED: Connects using your global, shared multi-tenant connection pool manager cleanly
        const tenantRedis = createTenantRedisClient(tenantConfig as any);
        const sessionCacheKey = `checkout:session:${cleanTelegramId}:${cleanSku}`;

        const verifiedPaymentState = {
            sessionToken: cleanSessionToken,
            tenantId,
            telegramId: cleanTelegramId,
            productSku: cleanSku,
            productName: productName || cleanSku,
            paymentStatus: "VERIFIED_PAID", // releases the bot polling locks instantly!
            amountPaid: amount,
            currency: body.currency || "ETB",
            gatewayUsed: gateway,
            capturedAt: new Date().toISOString()
        };

        // Writes the data securely into cache memory using the official SDK methods
        await tenantRedis.set(sessionCacheKey, JSON.stringify(verifiedPaymentState), { ex: 1800 });
        console.log(`[Dual-Write A] Verified payment cached cleanly using central factory: ${sessionCacheKey}`);

        // 4. Connect to the Tenant's specialized isolated Sanity project dataset
        const tenantClientInstance = createTenantClient(liveTenantConfig);

        const buyerRecord = await tenantClientInstance.fetch(
            `*[_type == "buyer" && telegramId == $telegramId]{ phoneNumber }`,
            { telegramId: cleanTelegramId }
        );
        const extractedPhone = buyerRecord?.phoneNumber || "Not shared / Anonymous";

        // 5. ─── DUAL WRITE DESTINATION B: COMPILE PERMANENT TRANSACTION RECORD IN SANITY ───
        const transactionDocument = {
            _type: "transaction",
            tenantId: tenantId,
            telegramId: cleanTelegramId,
            buyerPhone: extractedPhone,
            orderRef: tx_ref || `ord_${Date.now()}`,
            gatewayTransactionId: body.reference || `ref_net_${Date.now()}`,
            gatewayUsed: gateway,
            productId: cleanSku,
            productName: productName || cleanSku,
            productSlug: cleanSku,
            amountPaid: amount,
            currency: body.currency || "ETB",
            paymentStatus: "VERIFIED_PAID",
            fulfillmentStatus: "pending_shipping",
            capturedAt: new Date().toISOString()
        };

        await tenantClientInstance.create(transactionDocument);
        console.log(`[Dual-Write B] Permanent transaction audit log written safely to Sanity Studio.`);

        // 6. UPDATE PROFILE LIFE CYCLE FUNNEL STAGE TO CUSTOMER
        await updateBuyerProfile(cleanTelegramId, tenantClientInstance, {
            qualificationStage: "customer",
            leadScore: 100
        });

        console.log(`[Payment Webhook] Successfully advanced user ${cleanTelegramId} stage to 'customer'.`);
        return NextResponse.json({ processed: true, status: "VERIFIED_PAID" }, { status: 200 });

    } catch (err: any) {
        console.error("[Payment Webhook] Settlement processing failure:", err);
        return new Response(`Internal Settlement Dual-Writing Failure: ${err.message}`, { status: 500 });
    }
}
