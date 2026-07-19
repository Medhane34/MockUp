// src/workflows/recommendation.ts
//
// ─── 🚀 DURABLE ROUTE D WORKFLOW ───────────────────────────────────────────
// Replaces the monolithic handleRecommendation() call with a 4-step durable
// execution graph. Each step runs in its own serverless function window,
// eliminating the 60-second timeout risk and providing automatic retry on
// transient 429 / network failures.
//
// Step 1: Shadow AI extraction + lead scoring
// Step 2: Schema + history + MCP warm-up + system prompt compilation
// Step 3: Primary streaming generation → Telegram dispatch
// Step 4: Background telemetry sink (history save + insights + buyer profile)
//
// Triggered fire-and-forget from the QStash processor for the
// "recommendation" / "qualification" intents.

import { streamText } from "ai";
import { createGateway } from "@ai-sdk/gateway";
import { getCachedSchema } from "@/lib/sanity/context";
import { createTenantMCPClient } from "@/lib/mcp-client";
import { getConversationHistory, saveToHistory } from "@/lib/ai/conversation";
import { createTenantRedisClient } from "@/lib/upstash";
import { createTenantWriteClient } from "@/sanity/client";
import { persistInsights } from "@/lib/ai/Insights";
import { getAgentConfig, compileSystemPrompt } from "@/lib/sanity/getAgentConfig";
import { getOrCreateBuyer, updateBuyerProfile } from "@/lib/sanity/buyer";
import { shadowExtractQualification, calculateDynamicLeadStatus } from "@/lib/qualification";
import { cleanMarkdownStream, stripMarkdown, sendFormattedMessage } from "@/lib/telegram/format";
import type { TenantConfig } from "@/types/tenant";
import type { IntentResult } from "@/lib/ai/intent";

// ─── PAYLOAD TYPE ──────────────────────────────────────────────────────────
export type RecommendationWorkflowPayload = {
  tenant: TenantConfig;
  chatId: number;
  telegramId: string;
  userText: string;
  intentResult: IntentResult;
};

const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

// ─── DURABLE WORKFLOW FUNCTION ────────────────────────────────────────────
export async function recommendationWorkflow(
  payload: RecommendationWorkflowPayload
) {
  "use workflow";

  const { tenant, chatId } = payload;

  console.log(
    `[Workflow][Route D][${tenant.companyName}] Starting durable execution for chat: ${chatId}`
  );

  // Step 1: Shadow AI extraction + lead scoring
  const step1Result = await extractLeadData(payload);

  // Step 2: Context + history + MCP warm-up + system prompt compilation
  const step2Result = await loadContextAndHistory(payload, step1Result.updatedProfile);

  // Step 3: Primary AI streaming generation → Telegram dispatch
  const finalText = await streamAndDispatch(payload, step2Result);

  // Step 4: Background telemetry sink (guaranteed completion)
  await commitTelemetry(payload, step1Result, finalText);

  console.log(
    `[Workflow][Route D][${tenant.companyName}] ✅ Durable execution complete for chat: ${chatId}`
  );
}

// ─── STEP 1: SHADOW AI EXTRACTION + LEAD SCORING ─────────────────────────
async function extractLeadData(payload: RecommendationWorkflowPayload) {
  "use step";

  const { tenant, chatId, userText, intentResult } = payload;
  const tenantRedis = createTenantRedisClient(tenant);
  const qualificationKey = `qualification:${chatId}`;

  const [shadowData, cachedBantRaw] = await Promise.all([
    shadowExtractQualification(userText),
    tenantRedis.get(qualificationKey).catch(() => null),
  ]);

  const cachedBant = cachedBantRaw
    ? typeof cachedBantRaw === "string"
      ? JSON.parse(cachedBantRaw)
      : cachedBantRaw
    : null;

  const updatedProfile = {
    coreNeed:
      shadowData?.coreNeed || cachedBant?.coreNeed || "Catalog Exploration",
    budgetRange: shadowData?.budgetRange || cachedBant?.budgetRange || "",
    interests: cachedBant?.interests || [intentResult.intent || "recommendations"],
  };

  const { stage, score } = calculateDynamicLeadStatus(updatedProfile);

  console.log(
    `[Workflow Step 1][${tenant.companyName}] Lead scored: stage=${stage} score=${score}`
  );

  // Persist updated qualification to Redis (checkpoint-safe)
  await tenantRedis
    .set(qualificationKey, JSON.stringify(updatedProfile))
    .catch((e: any) =>
      console.warn("[Workflow Step 1] Redis write failed:", e.message)
    );

  return { shadowData, updatedProfile, stage, score };
}

// ─── STEP 2: CONTEXT + HISTORY + MCP WARM-UP ─────────────────────────────
async function loadContextAndHistory(
  payload: RecommendationWorkflowPayload,
  updatedProfile: { coreNeed: string; budgetRange: string; interests: string[] }
) {
  "use step";

  const { tenant, chatId, userText, intentResult } = payload;
  const tenantRedis = createTenantRedisClient(tenant);
  const groqFilter = `_type in ["product", "category", "faq"]`;

  const [initialContext, mcpRes, rawHistory, cmsAgentConfig] =
    await Promise.all([
      getCachedSchema(tenant),
      createTenantMCPClient(tenant.id, groqFilter),
      getConversationHistory(tenantRedis, String(chatId), tenant).catch(() => []),
      getAgentConfig(tenant, "route-d"),
    ]);

  if (!initialContext) {
    throw new Error(
      `[Workflow Step 2][${tenant.companyName}] Schema context unavailable.`
    );
  }

  const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];

  const DEFAULT_PROMPT = `You are an expert sales consultancy advisor for ${tenant.companyName}. Your primary role is evaluating customer preferences and matching them to our inventory database rows.`.trim();

  let activeSystemPrompt = DEFAULT_PROMPT;
  if (cmsAgentConfig?.systemPrompt) {
    activeSystemPrompt = compileSystemPrompt({
      rawPrompt: cmsAgentConfig.systemPrompt,
      tenant,
      initialContext,
      intentName: intentResult.intent || "recommendation",
      userText,
      languageCode: intentResult.language || "en",
      cmsAgentConfig,
      userBudget: updatedProfile.budgetRange || "Not Specified Yet",
      userInterests: updatedProfile.interests.join(", "),
    });
  }

  const llmMessages = [
    ...cleanHistory.map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
    { role: "user" as const, content: userText },
  ];

  const activeFallbackMessage =
    cmsAgentConfig?.fallbackMessage ||
    "No products matched your parameters currently.";

  console.log(
    `[Workflow Step 2][${tenant.companyName}] Context loaded — ${cleanHistory.length} history messages, MCP tools ready.`
  );

  // NOTE: mcpRes.mcp is the MCP client handle. We return the tools object for Step 3.
  // The mcp handle is passed to ensure close() is called in the step.
  return {
    activeSystemPrompt,
    llmMessages,
    mcpTools: mcpRes.mcpTools,
    mcpHandle: mcpRes.mcp,
    activeFallbackMessage,
  };
}

// ─── STEP 3: STREAMING GENERATION → TELEGRAM DISPATCH ────────────────────
async function streamAndDispatch(
  payload: RecommendationWorkflowPayload,
  context: Awaited<ReturnType<typeof loadContextAndHistory>>
) {
  "use step";

  const { tenant, chatId } = payload;
  const { activeSystemPrompt, llmMessages, mcpTools, mcpHandle, activeFallbackMessage } =
    context;

  const streamAbortController = new AbortController();
  const streamDeadline = setTimeout(() => {
    streamAbortController.abort();
  }, 25000);

  let accumulatedText = "";

  try {
    const result = streamText({
      model: gateway("google/gemini-2.5-flash"),
      system: activeSystemPrompt,
      messages: llmMessages,
      tools: mcpTools,
      maxRetries: 3,
      abortSignal: streamAbortController.signal,
      stopWhen: ({ steps }: any) => steps.length >= 4,
      onFinish: () => {
        clearTimeout(streamDeadline);
        mcpHandle.close().catch(() => { });
      },
    });

    // Consume stream progressively and accumulate the checkpoint string
    for await (const chunk of cleanMarkdownStream(result.textStream)) {
      if (streamAbortController.signal.aborted) break;
      accumulatedText += chunk;
    }

    clearTimeout(streamDeadline);

    const safeText =
      stripMarkdown(accumulatedText).trim() || activeFallbackMessage;

    // Send the fully accumulated message to Telegram
    await sendFormattedMessage(
      tenant.telegramBotToken,
      chatId,
      safeText,
      "HTML",
      null
    );

    console.log(
      `[Workflow Step 3][${tenant.companyName}] ✅ Message sent to Telegram (${safeText.length} chars)`
    );

    return safeText;
  } catch (err: any) {
    clearTimeout(streamDeadline);
    mcpHandle.close().catch(() => { });
    console.error(
      `[Workflow Step 3][${tenant.companyName}] Stream error:`,
      err.message
    );
    // Return fallback so Step 4 still runs and commits what it can
    return activeFallbackMessage;
  }
}

// ─── STEP 4: TELEMETRY SINK ───────────────────────────────────────────────
async function commitTelemetry(
  payload: RecommendationWorkflowPayload,
  step1Result: Awaited<ReturnType<typeof extractLeadData>>,
  finalText: string
) {
  "use step";

  const { tenant, chatId, telegramId, userText, intentResult } = payload;
  const tenantRedis = createTenantRedisClient(tenant);
  const writeClient = createTenantWriteClient(tenant);
  const { updatedProfile, stage, score } = step1Result;

  // 4a. Persist conversation history (sequential to avoid overwrite collisions)
  await saveToHistory(tenantRedis, String(chatId), "user", userText);
  await saveToHistory(tenantRedis, String(chatId), "assistant", finalText);

  // 4b. Update buyer profile in Sanity CMS
  await getOrCreateBuyer(telegramId, "telegram_shopper", writeClient)
    .then(() =>
      updateBuyerProfile(telegramId, writeClient, {
        coreNeed: updatedProfile.coreNeed,
        interests: updatedProfile.interests,
        budgetRange: updatedProfile.budgetRange
          ? updatedProfile.budgetRange.replace("_", " ")
          : "",
        qualificationStage: stage,
        leadScore: score,
      })
    )
    .catch((err: any) =>
      console.warn(
        `[Workflow Step 4][${tenant.companyName}] Buyer profile update failed (non-fatal):`,
        err.message
      )
    );

  // 4c. Fetch the fully updated history for telemetry payload
  const updatedHistory = await getConversationHistory(
    tenantRedis,
    String(chatId),
    tenant
  ).catch(() => []);

  const telemetryMessages = updatedHistory.map((msg: any) => ({
    role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: msg.content || "",
  }));

  // 4d. Persist conversation to Sanity Context Insights (Content Lake)
  await persistInsights(
    writeClient,
    {
      agentId: `${tenant.subdomain}-recommendation-agent`,
      threadId: String(chatId),
      messages: telemetryMessages,
      intentName: intentResult.intent,
      language: intentResult.language,
    },
    tenant.companyName
  ).catch((err: any) =>
    console.warn(
      `[Workflow Step 4][${tenant.companyName}] Insights persist failed (non-fatal):`,
      err.message
    )
  );

  console.log(
    `[Workflow Step 4][${tenant.companyName}] ✅ Telemetry committed — ${telemetryMessages.length} messages logged.`
  );
}
