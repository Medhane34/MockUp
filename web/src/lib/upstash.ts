// src/lib/upstash.ts
import { Redis } from "@upstash/redis";
import { Client as QStashClient } from "@upstash/qstash";
import type { TenantContext } from "@/types/tenant";

// Memory caches to reuse live connection links across the serverless lifecycle
const tenantRedisCache = new Map<string, Redis>();
const tenantQStashCache = new Map<string, QStashClient>();

/**
 * 🟢 DYNAMIC REDIS FACTORY
 * Retrieves or builds a completely isolated Upstash Redis client for a specific tenant.
 */
export function createTenantRedisClient(tenant: Pick<TenantContext, 'id' | 'redisUrl' | 'redisToken' | 'companyName'>): Redis {
  const cached = tenantRedisCache.get(tenant.id);
  if (cached) return cached;

  if (!tenant.redisUrl || !tenant.redisToken) {
    throw new Error(`[Redis Factory] Tenant "${tenant.companyName}" is missing active Redis database credentials.`);
  }

  const client = new Redis({
    url: tenant.redisUrl.trim(),
    token: tenant.redisToken.trim(),
  });

  tenantRedisCache.set(tenant.id, client);
  return client;
}

/**
 * 🟢 DYNAMIC QSTASH FACTORY
 * Retrieves or builds a completely isolated Upstash QStash client for a specific tenant.
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
