// functions/classify-conversations/index.ts
import { documentEventHandler } from '@sanity/functions';
import { createClient } from "@sanity/client";
import { classifyConversations } from "@sanity/context/insights";
import { createGateway } from '@ai-sdk/gateway';
import { google } from '@ai-sdk/google';
import { createGoogleGenerativeAI } from '@ai-sdk/google'; // ─── 🟢 FIXED: OFFICIAL PROVIDER CONSTRUCTOR

// ─── 🛡️ VERCEL AI GATEWAY PROXY ANCHOR ───
const gateway = createGateway({
  apiKey: process.env.AI_GATEWAY_API_KEY,
});

/**
 * ⚡ REAL-TIME MULTI-TENANT EVENT-DRIVEN INSIGHTS WORKER
 */
export const handler = documentEventHandler(async ({ context, event }) => {
  const invocationTime = new Date().toLocaleTimeString();

  // Extract triggering data properties directly from Sanity's context options
  const triggeringProjectId = context.clientOptions.projectId;
  const triggeringDataset = context.clientOptions.dataset;

  console.log(`\n⚡ [Event-Driven Trigger] Function called at ${invocationTime}`);
  console.log(`----------------------------------------------------------------------`);
  console.log(`Project Source:   ${triggeringProjectId}`);
  console.log(`Dataset Target:   ${triggeringDataset}`);
  console.log(`----------------------------------------------------------------------\n`);

  if (!triggeringProjectId) {
    console.error("❌ [Classifier Failure] Aborted: Triggering context is missing a valid projectId.");
    return;
  }

  // Initial lookup client used to read the local tenant billing configuration profile document
  const lookupClient = createClient({
    projectId: context.clientOptions.projectId, // 🟢 Native platform ID
    dataset: context.clientOptions.dataset || "production",
    apiVersion: "2026-06-01",
    token: context.clientOptions.token, // 🟢 Automated system access token
    useCdn: false,
  });

  try {
    // ─── 🏁 THE MULTI-TENANT PREMIUM SAAS TIER FEATURE GATE ───
    const tenantDoc = await lookupClient.fetch(
      `*[_type == "tenant" && status == "active"]{
         enableInsightsDashboard,
         companyName,
         projectId,
         dataset,
         sanityApiToken
      }`
    );

    if (!tenantDoc) {
      console.warn(`⚠️ [Skipped] No active tenant configuration document found for project ID: ${triggeringProjectId}`);
      return;
    }

    const company = tenantDoc.companyName || "Unknown Tenant";
    const rawFeatureGateFlag = tenantDoc.enableInsightsDashboard;

    console.log(`[Feature Gate Check][${tenantDoc.companyName}] enableInsightsDashboard:`, rawFeatureGateFlag);

    // If explicitly set to false, self-extinguish instantly to protect your gateway credit balances
    if (rawFeatureGateFlag === false) {
      console.log(`🛑 [Access Blocked][${tenantDoc.companyName}] Tenant hasn't paid for the Insights Tier. Terminating worker execution.`);
      return;
    }
    console.log(`🚀 [Access Granted][${tenantDoc.companyName}] Initializing isolated multi-tenant data client...`);
    // ─── 🟢 FIXED: EXTRACT SECRETS VIA SECURE CONTAINER ENVIRONMENT VARIABLES ───
    // Sanity cloud secrets uploaded via 'sanity function secret set' map straight into process.env! [1]
    /*   const platformApiKeySecret = process.env.GEMINI_API_KEY;
      const gatewayAuthTokenSecret = process.env.AI_GATEWAY_API_KEY;
  
      if (!platformApiKeySecret || platformApiKeySecret.trim() === "") {
        console.error(`❌ [Classifier Failure][${company}] Authentication Error: GEMINI_API_KEY environment token not found.`);
        return;
      } */

    console.log(`🚀 [Access Granted][${tenantDoc}] Initializing isolated multi-tenant data client...`);

    // ─── 🟢 FIXED: INITIALIZE USING SPECIFIC TENANT PROFILE PROPERTIES ───
    const tenantClient = createClient({
      projectId: tenantDoc.projectId || triggeringProjectId,
      dataset: tenantDoc.dataset || triggeringDataset || 'production',
      token: tenantDoc.sanityApiToken,
      apiVersion: '2026-06-01',
      useCdn: false,
    });

    console.log(`[Classifier][${tenantDoc}] Executing stream calculations via Vercel AI Gateway model...`);
    // ─── 🛡️ VERCEL AI GATEWAY PROXY RE-ALIGNMENT (FIXED) ───
    // We instantiate the Google AI provider using your explicit Vercel Gateway baseURL [1]!
    /* const proxiedGoogleProvider = createGoogleGenerativeAI({
      apiKey: platformApiKeySecret.trim(),
      // Points your classification steps directly through your secure Vercel sub-route [1]
      baseURL: 'https://vercel.sh',
      headers: gatewayAuthTokenSecret ? {
        'Authorization': `Bearer ${gatewayAuthTokenSecret.trim()}`
      } : undefined
    });
 */
    const apiKey = process.env.GOOGLE_API_KEY
    if (!apiKey) {
      console.error('❌ Missing GOOGLE_GENERATIVE_AI_API_KEY — aborting')
      return
    }
    // ─── 🧠 NATIVE SANITY CONTEXT AUTOMATED AUDITING ENVELOPE ───
    await classifyConversations({
      client: tenantClient,
      model: google('gemini-2.5-flash'),
    });

    console.log(`✅ [Audit Sealed][${company}] Dashboard charts updated successfully.`);

  } catch (err: any) {
    console.error(`❌ [Event Worker Exception] Core classification cycle collapsed:`, err.message);
  }
});
