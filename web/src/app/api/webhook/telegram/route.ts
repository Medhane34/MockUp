// src/app/api/webhook/telegram/route.ts
import { NextRequest } from "next/server";
import type { TenantContext } from "@/types/tenant";
import { adminClient } from "@/sanity/client";
import { createTenantRedisClient, createTenantQStashClient } from "@/lib/upstash";

// Allow up to 10s for webhook ingestion
export const maxDuration = 10;

// ─── Tenant Resolution Cache ───────────────────────────────────────────────────
// Keyed by telegramWebhookSecret. TTL = 5 minutes.
const TENANT_CACHE_TTL = 5 * 60 * 1000;
const tenantBySecretCache = new Map<string, { tenant: TenantContext; expires: number }>();

async function resolveTenantBySecret(secret: string): Promise<TenantContext | null> {
    // 1. Check cache first
    const cached = tenantBySecretCache.get(secret);
    if (cached && Date.now() < cached.expires) {
        return cached.tenant;
    }

    // 2. Query admin project for the matching tenant
    try {
        const tenant = await adminClient.fetch<TenantContext | null>(
            `*[_type == "tenant" && telegramWebhookSecret == $secret && status in ["active", "trial"]][0]{
                "id": _id,
                companyName,
                "subdomain": subdomain.current,
                niche,
                supportHandle,
                systemPrompt,
                conversionGoalDescription,
                telegramBotToken,
                telegramWebhookSecret,
                projectId,
                dataset,
                sanityApiToken,
                dailyMessageLimit,
                status,
                redisUrl,
                redisToken,
                qstashToken,
                qstashTopicId,
                monthlyAiTokenLimit,
                currentMonthTokens,
                monthlyAiCostLimit,
                qstashCurrentSigningKey,
                qstashNextSigningKey,
                monthlyAiTokenLimit,

            }`,
            { secret }
        );

        if (tenant) {
            tenantBySecretCache.set(secret, { tenant, expires: Date.now() + TENANT_CACHE_TTL });
        }
        return tenant ?? null;
    } catch (e) {
        console.error("[Webhook] Tenant resolution failed:", e);
        return null;
    }
}

// ─── Webhook Ingestion Receiver ───────────────────────────────────────────────────
export async function POST(request: NextRequest) {
    console.log("[Webhook] Received a new request from Telegram");

    // 1. Extract and validate the Telegram secret token header
    const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
    if (!secretHeader) {
        console.warn("[Webhook] Missing secret token header — rejecting");
        return new Response("Unauthorized", { status: 401 });
    }

    // 2. Resolve tenant context from the secret token
    const tenant = await resolveTenantBySecret(secretHeader);
    if (!tenant) {
        console.warn("[Webhook] No active tenant found for provided secret — rejecting");
        return new Response("Unauthorized", { status: 401 });
    }

    // 3. Parse request payload body
    let update: any;
    try {
        update = await request.json();
    } catch {
        console.error(`[Webhook][${tenant.companyName}] Failed to parse request body`);
        return new Response("Bad Request", { status: 400 });
    }

    // ─── 🔄 INITIALIZE DYNAMIC ISOLATED CLIENTS FOR THIS TENANT ONLY ───
    // These pull direct connection lines out of your fresh upstash.ts factory map pools dynamically
    const tenantRedis = createTenantRedisClient(tenant);
    const tenantQStash = createTenantQStashClient(tenant);

    // 4. De-duplicate Telegram message retries using Tenant's isolated Redis instance (TTL 1 Hour)
    const updateId = update.update_id;
    if (updateId) {
        // Safe flat layout format: isolated physically by database instance tokens natively
        const dedupeKey = `telegram:dedupe:${updateId}`;
        try {
            // 🔄 FIXED: Uses tenantRedis instead of the old root platform instance
            const isDuplicate = await tenantRedis.set(dedupeKey, "queued", { nx: true, ex: 3600 });
            if (!isDuplicate) {
                console.log(`[Webhook][${tenant.companyName}] Duplicate update_id ${updateId} detected and dropped in isolated tenant database.`);
                return new Response("OK", { status: 200 });
            }
        } catch (err) {
            console.warn(`[Webhook][${tenant.companyName}] Tenant deduplication check failed (non-blocking):`, err);
        }
    }

    // 5. Determine the dynamic process callback URL based on headers (works locally & in production)
    const host = request.headers.get("host") || process.env.VERCEL_URL || "";
    const protocol = host.includes("localhost") ? "http" : "https";
    const processUrl = `${protocol}://${host}/api/webhook/telegram/process`;

    console.log(`[Webhook][${tenant.companyName}] Queuing Telegram update ${updateId || "unknown"} to isolated QStash target: ${processUrl}`);

    // 6. Forward payload to the Tenant's completely isolated QStash Queue Topic pipeline
    try {
        // 🔄 FIXED: Uses tenantQStash client instead of old central environment variable configs
        await tenantQStash.publishJSON({
            url: processUrl,
            body: { update, tenant },
            // Dynamically pass their unique project Topic identifier parameters if needed by your setup
            // topic: tenant.qstashTopicId 
        });
        console.log(`[Webhook][${tenant.companyName}] Task successfully queued inside tenant's unique QStash workspace`);
    } catch (err: any) {
        console.error(`[Webhook][${tenant.companyName}] Failed to enqueue task to tenant's QStash space:`, err);
        return new Response("Queue service unavailable", { status: 500 });
    }

    // 7. Return 200 OK instantly to Telegram so it doesn't trigger retries
    return new Response("OK", { status: 200 });
}
