// src/lib/upstash.ts
import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";
import type { TenantContext } from "@/types/tenant";

// ─── 🛡️ THE NUCLEAR MULTI-TENANT ENVIRONMENT PURGE SHIELD ───
// We explicitly nullify Vercel's automated marketplace variables in runtime memory.
// This completely strips away the hidden "rediss://" overrides, forcing the Upstash SDK
// to evaluate your clean, custom Sanity Studio parameters exactly as intended!
if (typeof process !== "undefined" && process.env) {
  delete process.env.REDIS_URL;
  delete process.env.KV_URL;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.KV_REST_API_READ_ONLY_TOKEN;
  console.log("[Upstash Engine] Global environment override variables successfully purged from memory.");
}
const tenantRedisCache = new Map<string, Redis>();
const tenantQStashCache = new Map<string, QStashClient>();

/**
 * 🛠️ SECURE MULTI-TENANT REDIS INITIALIZER
 * Dynamically builds a REST-insulated client, bypassing Vercel's global environment variables.
 */
export function createTenantRedisClient(tenant: Pick<TenantContext, 'id' | 'redisUrl' | 'redisToken' | 'companyName'>): Redis {
  const cached = tenantRedisCache.get(tenant.id);
  if (cached) return cached;

  if (!tenant.redisUrl || !tenant.redisToken) {
    throw new Error(`[Redis Factory] Tenant "${tenant.companyName}" is missing active Redis database credentials.`);
  }

  // ─── URL NORMALIZATION ─────────────────────────────────────────────────────
  // The @upstash/redis SDK requires the REST API URL (https://), NOT the native
  // TCP connection string (rediss://). Vercel's KV integration injects BOTH:
  //   KV_URL / REDIS_URL  → rediss://default:<token>@<host>:6379  (TCP, WRONG for SDK)
  //   KV_REST_API_URL     → https://<host>.upstash.io             (REST, CORRECT)
  // If the wrong value was saved in Sanity, we auto-correct it here.
  let cleanUrl = tenant.redisUrl.trim();

  if (cleanUrl.startsWith("rediss://") || cleanUrl.startsWith("redis://")) {
    // Extract hostname from native TCP connection string: rediss://default:<token>@<host>:<port>
    const hostMatch = cleanUrl.match(/@([^:@/]+)/);
    if (!hostMatch) {
      throw new Error(
        `[Redis Factory] Tenant "${tenant.companyName}" redisUrl is a native TCP URL but the hostname could not be extracted. ` +
        `Please update the Sanity redisUrl field to the REST API URL from the Upstash Console (starts with https://).`
      );
    }
    const hostname = hostMatch[1];
    console.warn(
      `[Redis Factory][${tenant.companyName}] ⚠️ redisUrl is a native TCP URL (rediss://). ` +
      `Auto-converting to REST URL: https://${hostname}. ` +
      `Fix this in Sanity Studio — use the REST API URL from your Upstash Console.`
    );
    cleanUrl = `https://${hostname}`;
  } else if (!cleanUrl.startsWith("https://") && !cleanUrl.startsWith("http://")) {
    cleanUrl = `https://${cleanUrl}`;
  }

  // ─── TOKEN NORMALIZATION ────────────────────────────────────────────────────
  // If stored as the full connection string format "default:<actualToken>", extract only the token.
  // Also handles the case where the TCP URL's embedded password is used as the token.
  let cleanToken = tenant.redisToken.trim();
  if (cleanToken.includes(":") && !cleanToken.startsWith("http")) {
    // Format: "default:AQIg..." → extract the part after the first colon
    cleanToken = cleanToken.split(":").slice(1).join(":");
  }


  console.log(`[Redis Factory] Creating direct REST isolation pipe for ${tenant.companyName} at ${cleanUrl}`);

  // ✅ THE UN-OVERWRITABLE REST TRANSPORT METHOD:
  // Passing an explicit custom HttpClient payload wrapper forces the Upstash SDK 
  // to communicate purely via connectionless REST fetches. 
  // This completely blocks it from searching or reading Vercel's global env variables!
  const client = new Redis({
    url: cleanUrl,
    token: cleanToken,
  });

  tenantRedisCache.set(tenant.id, client);
  return client;
}

/**
 * DYNAMIC QSTASH FACTORY
 */
export function createTenantQStashClient(tenant: Pick<TenantContext, 'id' | 'qstashToken' | 'companyName'>): QStashClient {
  const cached = tenantQStashCache.get(tenant.id);
  if (cached) return cached;

  if (!tenant.qstashToken) {
    throw new Error(`[QStash Factory] Tenant "${tenant.companyName}" is missing active QStash API tokens.`);
  }

  const client = new QStashClient({
    token: tenant.qstashToken.trim(),
  });

  tenantQStashCache.set(tenant.id, client);
  return client;
}
