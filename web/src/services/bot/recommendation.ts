// src/services/bot/recommendation.service.ts
import { getCachedSchema } from "@/lib/sanity/context";
import { createTenantMCPClient } from "@/lib/mcp-client";
import { streamText } from "ai";
import { cleanMarkdownStream, stripMarkdown } from "@/lib/telegram/format";
import { createTenantRedisClient } from "@/lib/upstash";
import { createGateway } from '@ai-sdk/gateway';
import type { BotServiceArgs } from "@/types/bot";
import { getConversationHistory, saveToHistory } from "@/lib/ai/conversation";
import { createTenantWriteClient } from "@/sanity/client";
import { persistInsights } from "@/lib/ai/Insights";
import { getAgentConfig, compileSystemPrompt } from "@/lib/sanity/getAgentConfig";
// Dynamic profile loaders
import { getOrCreateBuyer, updateBuyerProfile } from "@/lib/sanity/buyer";
import { shadowExtractQualification, calculateDynamicLeadStatus } from "@/lib/qualification";

const gateway = createGateway({ apiKey: process.env.AI_GATEWAY_API_KEY });

export async function handleRecommendation({
    tenant,
    intentResult,
    thread,
    chatId,
    userText,
}: BotServiceArgs): Promise<void> {
    console.log(`[Route D][${tenant.companyName}] Commencing natural consulting tracking processing...`);

    const DEFAULT_RECOMMENDATION_PROMPT = `
    You are an expert sales consultancy advisor for ${tenant.companyName}.
    Your primary role is evaluating customer preferences and matching them to our inventory database rows.
    `.trim();

    const tenantRedisInstance = createTenantRedisClient(tenant);
    const qualificationKey = `qualification:${chatId}`;
    const groqFilter = `_type in ["product", "category", "faq"]`;

    // ─── ⚡ PARALLEL INITIALIZATION BLOCK ───
    const [initialContext, mcpRes, rawHistory, rawBant, cmsAgentConfig] = await Promise.all([
        getCachedSchema(tenant),
        createTenantMCPClient(tenant.id, groqFilter),
        getConversationHistory(tenantRedisInstance, chatId, tenant).catch(() => []),
        tenantRedisInstance.get(qualificationKey).catch(() => null),
        getAgentConfig(tenant, "route-d")
    ]);

    if (!initialContext) throw new Error(`[Route D] Schema context unavailable.`);

    const cleanHistory = Array.isArray(rawHistory) ? rawHistory : [];
    const writeClient = createTenantWriteClient(tenant);

    // ─── 🧠 SHADOW BACKGROUND AI EXTRACTION WAVE ───
    const shadowData = await shadowExtractQualification(userText);
    const cachedBantData = rawBant ? (typeof rawBant === "string" ? JSON.parse(rawBant) : rawBant) : null;

    // Build the consolidated profile context values list
    const updatedProfile = {
        coreNeed: shadowData?.coreNeed || cachedBantData?.coreNeed || "Catalog Exploration",
        // 🟢 FIXED: Cleans the inferred budget text value to keep states uniform
        budgetRange: shadowData?.budgetRange || cachedBantData?.budgetRange || "",
        interests: cachedBantData?.interests || [intentResult.intent || "recommendations"]
    };

    // Calculate updated lead statuses against the streamlined 2-point matrix
    const { stage, score } = calculateDynamicLeadStatus(updatedProfile);

    // ─── 🚀 UNIFIED PROFILE STORAGE SYNCHRONIZATION ───
    // Validates existence via getOrCreateBuyer first to secure both old and new leads!
    await Promise.all([
        tenantRedisInstance.set(qualificationKey, JSON.stringify(updatedProfile)),
        getOrCreateBuyer(chatId, "telegram_shopper", writeClient).then(() =>
            updateBuyerProfile(chatId, writeClient, {
                coreNeed: updatedProfile.coreNeed,
                interests: updatedProfile.interests,
                // 🟢 FIXED: Replaces underscores with spaces to comply perfectly with Studio drop-downs!
                // e.g., "50K_100K" becomes "50K 100K" natively before committing the patch
                budgetRange: updatedProfile.budgetRange ? updatedProfile.budgetRange.replace("_", " ") : "",
                qualificationStage: stage,
                leadScore: score
            })
        )
    ]).catch((err) => console.error(`[Route D Telemetry Skip]:`, err.message));

    // ─── 🟢 DYNAMIC CMS PROMPT COMPILATION ───
    let activeSystemPrompt = "";
    if (cmsAgentConfig?.systemPrompt) {
        console.log(`[Route D][${tenant.companyName}] Utilizing active CMS system prompt: "${cmsAgentConfig.name}"`);
        activeSystemPrompt = compileSystemPrompt({
            rawPrompt: cmsAgentConfig.systemPrompt,
            tenant,
            initialContext: initialContext,
            intentName: intentResult.intent || "recommendation",
            userText: userText,
            languageCode: intentResult.language || "en",
            cmsAgentConfig: cmsAgentConfig,
            userBudget: updatedProfile.budgetRange || "Not Specified Yet",
            userInterests: updatedProfile.interests.join(", ")
        });
    } else {
        activeSystemPrompt = DEFAULT_RECOMMENDATION_PROMPT;
    }

    const activeFallbackMessage = cmsAgentConfig?.fallbackMessage || "No products matched your parameters currently.";
    const llmMessages = [
        ...cleanHistory.map((msg) => ({ role: msg.role, content: msg.content })),
        { role: "user" as const, content: userText }
    ];

    const streamAbortController = new AbortController();
    const streamDeadline = setTimeout(() => { streamAbortController.abort(); }, 25000);

    try {
        const result = streamText({
            model: gateway('google/gemini-2.5-flash'),
            system: activeSystemPrompt,
            messages: llmMessages,
            tools: mcpRes.mcpTools,
            maxRetries: 3,
            abortSignal: streamAbortController.signal,
            stopWhen: ({ steps }) => steps.length >= 4,
            onFinish: () => { clearTimeout(streamDeadline); mcpRes.mcp.close(); },
        });

        await thread.post(cleanMarkdownStream(result.textStream));
        clearTimeout(streamDeadline);

        const safeText = stripMarkdown(await result.text).trim() || activeFallbackMessage;

        // Commit histories sequentially to eliminate serverless overwrite collisions
        await saveToHistory(tenantRedisInstance, chatId, "user", userText);
        await saveToHistory(tenantRedisInstance, chatId, "assistant", safeText);

        const completelyUpdatedHistory = await getConversationHistory(tenantRedisInstance, chatId, tenant).catch(() => []);
        const finalPristineTelemetryList = completelyUpdatedHistory.map((msg) => ({
            role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: msg.content || ""
        }));

        await persistInsights(writeClient, {
            agentId: `${tenant.subdomain}-recommendation-agent`,
            threadId: chatId,
            messages: finalPristineTelemetryList,
            intentName: intentResult.intent,
            language: intentResult.language
        }, tenant.companyName).catch(() => null);

    } catch (err: any) {
        console.error(`[Route D Execution Crash]:`, err.message);
    } finally {
        clearTimeout(streamDeadline);
        await mcpRes.mcp.close();
    }
}
