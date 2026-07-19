/**
 * ============================================================================
 * 🧠 CENTRALIZED MULTI-TENANT CONVERSATION HISTORY MEMORY SUBSYSTEM
 * ============================================================================
 *
 * PURPOSE:
 * Provides unified, decoupled data-tier abstraction hooks to load and append
 * contextual chat logs across the platform's multi-tenant microservices tier.
 *
 * WHY DIRECT UPSTASH REDIS:
 * @chat-adapter/state-redis is built for TCP socket-based Redis (node-redis)
 * which requires a connect() → waitForReady() handshake via event emitters.
 * Upstash Redis is a stateless REST HTTP client — there is no connection state,
 * no 'ready' event, and no socket to hold open. Using RedisStateAdapter with a
 * mock 'on()' caused waitForReady() to block forever → Vercel timeout.
 * Direct rpush/lrange calls are instantaneous and always available.
 */

import type { Redis } from "@upstash/redis";

const LIST_PREFIX = "history";

/**
 * 🟢 GET CONVERSATION HISTORY (Memory Recall Hook)
 * Pulls bounded conversation history segments out of Upstash Redis.
 * Filters empty or corrupted logs, returning a clean history trace array.
 *
 * @param redis        - Tenant-isolated Upstash Redis REST client
 * @param threadId     - Unique Telegram Chat Identifier string parameter
 * @param tenantConfig - Tenant config object (reads .maxMemoryLimit)
 */
export async function getConversationHistory(
    redis: Redis,
    threadId: string,
    tenantConfig: any
): Promise<any[]> {
    if (!threadId || threadId.trim() === "") {
        console.warn("[Memory Core] Rejection: Cannot retrieve history tracing logs for an empty threadId.");
        return [];
    }

    try {
        const key = `${LIST_PREFIX}:${threadId.trim()}`;
        const dynamicLimitCapacity: number = tenantConfig?.maxMemoryLimit || 5;

        // lrange returns [] for a non-existent key — no error, no null check needed
        const raw: string[] = await redis.lrange(key, 0, -1);

        if (!raw || raw.length === 0) {
            return [];
        }

        // Parse each JSON-serialized entry, skip corrupted entries silently
        const history: any[] = raw.reduce<any[]>((acc, item) => {
            try {
                const parsed = typeof item === "string" ? JSON.parse(item) : item;
                if (parsed && parsed.role && parsed.content) acc.push(parsed);
            } catch {
                // skip corrupted entries
            }
            return acc;
        }, []);

        console.log(`[Memory Core] Retrieved ${history.length} history entries for thread [${threadId}]`);

        // Return the most recent N turns bounded by tenant config
        return history.slice(-dynamicLimitCapacity);

    } catch (e: any) {
        console.error(`[Memory Core] Critical Error: Failed to extract history traces for thread [${threadId}]:`, e.message);
        return [];
    }
}

/**
 * 🟢 SAVE TO HISTORY (Memory Persistence Hook)
 * Commits a completed conversational dialogue turn into the tenant's isolated storage node.
 *
 * @param redis    - Tenant-isolated Upstash Redis REST client
 * @param threadId - Unique Telegram Chat Identifier string parameter
 * @param role     - The conversational author identifier ('user' or 'assistant')
 * @param content  - Pristine plain-text message string payload to persist
 */
export async function saveToHistory(
    redis: Redis,
    threadId: string,
    role: "user" | "assistant",
    content: string
): Promise<void> {
    if (!threadId || !content || content.trim() === "") {
        return;
    }

    try {
        const key = `${LIST_PREFIX}:${threadId.trim()}`;
        const entry = JSON.stringify({
            role,
            content: content.trim(),
            timestamp: Date.now(),
        });

        // rpush appends to the right of the list — lrange returns entries in insertion order
        // Upstash REST is stateless — no connection, no disconnect, no event handles
        await redis.rpush(key, entry);

        console.log(`[Memory Core] History block successfully committed for thread [${threadId}] role: ${role}`);

    } catch (e: any) {
        console.error(`[Memory Core] Critical Error: Failed to save history segment for thread [${threadId}]:`, e.message);
    }
}
