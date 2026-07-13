// functions/classify-conversation/index.ts
import { createClient } from '@sanity/client'
import { classifyConversations } from '@sanity/context/insights'
import { documentEventHandler } from '@sanity/functions'
import { google } from '@ai-sdk/google'

export const handler = documentEventHandler(async ({ context, event }) => {
  const invocationTime = new Date().toLocaleTimeString()
  console.log(`⚡ [Document Trigger] Starting at ${invocationTime}`)

  // ✅ Validate API key
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) {
    console.error('❌ Missing GOOGLE_API_KEY — aborting')
    return
  }

  // ✅ Token must be scoped to THIS tenant's project
  // Set per-function in blueprint env — not shared across tenants
  const tenantToken = process.env.SANITY_API_WRITE_TOKEN
  if (!tenantToken) {
    console.error('❌ Missing SANITY_API_WRITE_TOKEN — aborting')
    return
  }

  // ✅ context already knows which project triggered this function
  const projectId = context.clientOptions.projectId
  const dataset = context.clientOptions.dataset || 'production'

  console.log(`[Classifier] Triggered by project: ${projectId}`)
  console.log(`[Classifier] Dataset: ${dataset}`)
  console.log(`[Classifier] Token present: ${!!tenantToken}`)

  try {
    // ✅ Use triggering project context + this tenant's own write token
    const tenantClient = createClient({
      projectId: projectId,
      dataset: dataset,
      apiVersion: '2026-06-01',
      token: tenantToken,
      useCdn: false,
    })

    const result = await classifyConversations({
      client: tenantClient,
      model: google('gemini-2.5-flash'),
      telemetry: { shareMetrics: true },
    })

    console.log(
      `✅ [${projectId}] ${result.successCount}/${result.totalFound} classified` +
      `${result.errorCount > 0 ? ` (${result.errorCount} failed)` : ''}`
    )
  } catch (err: any) {
    console.error(`❌ Classification failed:`, err.message)
    console.error(`❌ Status code:`, err.statusCode)
  }
})