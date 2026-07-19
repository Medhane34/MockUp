// src/app/api/webhook/sanity-schema-sync/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminClient } from "@/sanity/client";
import { getTenantConfig } from "@/lib/tenant";
import { invalidateTenantSchemaCache } from "@/lib/sanity/context";
/*  */
/**
 * 🔒 CRYPTOGRAPHIC NATIVE SIGNATURE VERIFIER
 * Verifies that the incoming raw HTTP payload originates genuinely from Sanity's Content Lake edge.
 */
function isValidSanitySignature(bodyText: string, incomingSignature: string, secret: string): boolean {
    if (!incomingSignature || !secret) return false;

    const computedSignature = crypto
        .createHmac("sha256", secret)
        .update(bodyText, "utf8")
        .digest("hex");

    // Fix: Convert Node.js Buffer to Uint8Array for compatibility with crypto.timingSafeEqual
    return crypto.timingSafeEqual(
        new Uint8Array(Buffer.from(computedSignature, "hex")),
        new Uint8Array(Buffer.from(incomingSignature, "hex"))
    );
}

export async function POST(request: NextRequest) {
    console.log("[Sanity Sync Webhook] Inbound catalog mutation event intercepted. Validating headers...");

    const signature = request.headers.get("x-sanity-signature") || "";
    const webhookSecret = process.env.SANITY_WEBHOOK_SECRET || "";

    if (!webhookSecret || webhookSecret === "") {
        console.error("[Sanity Sync Webhook] Critical Error: SANITY_WEBHOOK_SECRET is missing from server environment variables.");
        return new Response("Webhook Secret Misconfigured", { status: 500 });
    }

    try {
        // Extract raw body text string to execute signature verification checks precisely
        const rawBodyText = await request.text();

        // ─── 🛡️ FIX 2: CRYPTOGRAPHIC SIGNATURE SHIELD GATE ───
        if (!isValidSanitySignature(rawBodyText, signature, webhookSecret)) {
            console.warn("[Sanity Sync Webhook] Security Alert: Invalid cryptographic signature matching — rejecting.");
            return new Response("Unauthorized Signature", { status: 401 });
        }

        const body = JSON.parse(rawBodyText);
        const projectId = body._projectId;

        if (!projectId) {
            console.error("[Sanity Sync Webhook] Webhook payload is missing a valid _projectId reference identifier.");
            return new Response("Missing project identifier", { status: 400 });
        }

        console.log(`[Sanity Sync Webhook] Signature verified for Project ID: [${projectId}]. Mapping tenant owner...`);

        // ─── 🛡️ RESOLVE UNKNOWN IMPORT BY QUERYING REGISTRY DIRECTLY ───
        // We look up our core tenant registry using the verified platform client
        // 🔄 FIXED: Append '[0]' to your GROQ query string to extract the single matching object row cleanly!
        const resolvedTenant = await adminClient.fetch(
            `*[_type == "tenant" && projectId == $projectId][0]{ _id, companyName }`,
            { projectId }
        );


        if (!resolvedTenant || !resolvedTenant._id) {
            console.error(`[Sanity Sync Webhook] No tenant workspace profile registered on this platform for Project ID: ${projectId}`);
            return new Response("Tenant workspace profile not registered", { status: 404 });
        }

        // Pull the sanitized type-safe operational parameters configuration block safely
        const tenantConfig = await getTenantConfig(resolvedTenant._id);

        // 🟢 FORCE CACHE EVICTION: Evicts the stale initial-context mapping string instantly from Redis!
        await invalidateTenantSchemaCache(tenantConfig);

        console.log(`[Sanity Sync Webhook] SUCCESS: Stale schema cache evicted cleanly for: ${tenantConfig.companyName}`);
        return NextResponse.json({ evicted: true, tenant: tenantConfig.companyName }, { status: 200 });

    } catch (err: any) {
        console.error("[Sanity Sync Webhook] Exception thrown during pipeline execution:", err.message);
        return new Response(`Internal Sync Failure: ${err.message}`, { status: 500 });
    }
}
