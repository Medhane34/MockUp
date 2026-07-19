// src/services/bot/types.ts
import type { TenantConfig } from "@/types/tenant"
import type { IntentResult } from "@/lib/ai/intent"
import type { Thread } from "chat"

export interface BotServiceArgs {
    chatId: string
    thread: Thread
    intentResult: IntentResult
    tenant: TenantConfig
    userText: string
}