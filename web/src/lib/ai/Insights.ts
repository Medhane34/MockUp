// src/lib/ai/insights.ts
import { saveConversation } from '@sanity/context/insights';
import { SanityClient } from 'next-sanity';
// In the classification function the docs show this path
export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface InsightsPayload {
    agentId: string;       // e.g., 'aligoo-sales-agent'
    threadId: string;      // Telegram chatId
    messages: ConversationMessage[];
    intentName?: string;   // intentResult.intent
    language?: string;     // intentResult.language
}

/**
 * 🟢 PERSIST INSIGHTS TO CONTENT LAKE
 * Asynchronously pushes conversation turns straight to the central Sanity dataset.
 * This is NEVER awaited in the main execution path — ensuring 0ms user-facing latency.
 */
export function persistInsights(writeClient: SanityClient, payload: InsightsPayload, companyName = "Tenant"): void {
    console.log(`[Insights Logging][${companyName}] Initializing background telemetry tracking for user: ${payload.threadId}`);

    // Construct the standardized structure expected by the Sanity Context Insights schema
    saveConversation({
        client: writeClient,
        agentId: payload.agentId,
        threadId: payload.threadId,
        messages: payload.messages,

    })
        .then(() => {
            console.log(`[Insights Logging][${companyName}] Telemetry node successfully saved to Content Lake.`);
        })
        .catch((err: any) => {
            // Fail closed quietly to shield primary storefront operations from analytics latency drops
            console.error(`[Insights Logging Error][${companyName}] Background write dropped:`, err.message);
        });
}

