// src/lib/ai/insights.ts
import { saveConversation } from '@sanity/context/insights'
import { SanityClient } from 'next-sanity'

export interface ConversationMessage {
    role: 'user' | 'assistant'
    content: string
}

export interface InsightsPayload {
    agentId: string
    threadId: string
    messages: ConversationMessage[]
    intentName?: string
    language?: string
}

// ✅ Returns Promise<void> so await actually waits for the write to complete
export function persistInsights(
    writeClient: SanityClient,
    payload: InsightsPayload,
    companyName = 'Tenant'
): Promise<void> {
    console.log(
        `[Insights][${companyName}] Persisting ${payload.messages.length} messages for thread: ${payload.threadId}`
    )

    // ✅ Return the promise — caller's await now actually waits
    return saveConversation({
        client: writeClient,
        agentId: payload.agentId,
        threadId: payload.threadId,
        messages: payload.messages,
    })
        .then(() => {
            console.log(
                `[Insights][${companyName}] ✅ ${payload.messages.length} messages saved to Content Lake`
            )
        })
        .catch((err: any) => {
            // ✅ Re-throw so outer try/catch sees the real error
            console.error(`[Insights Error][${companyName}] Write failed:`, err.message)
            throw err
        })
}