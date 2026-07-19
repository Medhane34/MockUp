
## Architectural Decision Record (ADR): Durable Conversation Orchestration via Vercel Workflows## 1. Context & Background
Our platform operates as a high-velocity, real-time multi-tenant conversational commerce agent routing Telegram user text turns to targeted domain service pipelines (Route A: Structured, Route B: Semantic Search, Route D: AI Recommendation/Consultancy).
To power advanced B2B lead generation, our Route D pipeline executes a dual-inference architectural matrix on a single inbound message event:

   1. Inbound Extractions (Shadow AI): Invokes generateObject via a structured JSON schema to parse shopper needs and budgets in the background.
   2. Dynamic AI Consult & Tools Execution: Instantly invokes streamText backed by real-time Model Context Protocol (MCP) server graph layers to lookup live inventory rows and respond bilingually.

## The System Bottleneck
Under serverless execution environments (Vercel Edge/Serverless functions), running consecutive, un-checkpointed AI inference requests across a shared-pool API network (Vercel AI Gateway) forces a Concurrency Spike Collision Lock (HTTP 429 RateLimitExceededError).
Because standard functions lack state durability, a transient rate limit or an extended MCP database network round-trip triggers fatal execution crashes, truncates conversation memory cache indices, and limits long-lived multi-turn dialogue graphs.
------------------------------
## 2. Technical Evaluation: Solution Trade-Offs
Before settling on a durable state-machine workflow, our engineering team analyzed three alternative design configurations:

* Alternative A: Blind Micro-Queue Buffers (setTimeout)
* Mechanism: Artificially inserting a 800ms sleep block between the Shadow AI parse and the main text stream generation.
   * Rejection Reason: Adds dead idle latency directly to the critical path of a real-time Telegram bot, causing severe UX degradation while failing to protect the application against hard infrastructure timeouts.
* Alternative B: JSON-Mode Schema Compression inside streamText
* Mechanism: Eliminating generateObject entirely and forcing the streaming engine to return concatenated JSON fragments alongside conversational sentences.
   * Rejection Reason: Vercel AI SDK’s streamText cannot natively parse strict object structures. Forcing raw string parsing frequently breaks under multi-turn chat tracking sessions.
* Selected Path: Vercel Workflows (Durable State-Machine Execution)
* Mechanism: Turning each multi-tenant user conversation into an observable, checkpointed, durable execution workflow tree. [1] 

------------------------------
## 3. Why We Are Transitioning to Vercel Workflows (The Pros)## 🛡️ 1. Complete Immunity to HTTP 429 Rate Limits
Vercel Workflows manages an underlying distributed queue ledger. If our Shadow AI or primary streaming process hits a temporary concurrency rate-limit lock, the specific failing step automatically pauses, checkpoint-saves its variables state, and executes an automated Exponential Backoff Retry (e.g., retrying after 1s, 2s, 4s). The error is handled invisibly in the background, completely bypassing transient request spikes without dropping the customer's chat session.
## 🔌 2. Offloaded Non-Blocking Telemetry Sinks
Data operations that don't directly affect sending the message to Telegram—such as persistInsights telemetry pushes to Sanity, Lead Scoring matrix updates, and updateBuyerProfile mutations—are decoupled into independent backend workflow steps. The user receives their streamed message chunks instantly, while heavier database saves complete reliably in a secondary execution loop.
## ⏱️ 3. Safety Shield Against Serverless 60-Second Timeouts
Complex product searches using tools or multiple model fallbacks risk breaching Vercel's standard function execution limit. Vercel Workflows solves this by executing each step.run() block in a fresh serverless function time window (Fluid Compute). The overall conversation can safely run for minutes, hours, or days while waiting for user inputs or tool responses. [2, 3, 4] 
## 📊 4. Visual Observability & Failure Triage
Instead of sorting through scattered cloud log outputs or guessing why an analytics save skipped, Vercel Workflows exposes a graphical real-time dashboard. Our content and engineering teams can visually inspect step inputs, monitor JSON schema outputs, and analyze retry patterns directly in the Vercel console. [5] 
------------------------------
## 4. Engineering Factors & Trade-Offs to Consider (The Cons)
To ensure a successful integration, the engineering team must continuously monitor and balance these three runtime factors:

   1. Step Serialization Latency Overhead (100ms - 300ms)
   Every time the code moves from one context.run() step to another, Vercel serializes the active variable values and state to a managed database checkpoint. This introduces roughly 100ms to 300ms of static network overhead. To counteract this, any operations that do not depend on each other (like loading the tenant schema context and fetching conversation histories) must be kept grouped together inside a single step or executed via Promise.all within that step.
   2. Streaming Handshake Integrity
   Because workflows focus on state durability and checkpoint isolation, streaming real-time text progressively over a long-running durable path requires configuring the Vercel Workflows runtime options correctly. We must ensure the streamText generator pipes its text chunks directly to the Telegram API gateway thread concurrently, preventing the bot from hanging until the entire generation seals. [6] 
   3. Multi-Tenant State Namespacing Keys
   Because this workflow engine runs globally across our platform, we must explicitly pass the tenant.projectId and the user's Telegram chatId as primary entry payloads to every workflow instance. This maintains our strict data isolation rules and prevents any memory caches or database locks from colliding across separate merchant environments.

------------------------------
## 5. Target Integration Pipeline Design
Our new, unified production entry point will structure its execution steps into four clear checkpoints:

                  [Telegram Inbound Webhook Event Entry]
                                    │
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Step 1: Shadow AI Extraction & Lead Status Compiler     │
       │ - Invokes generateObject (Bypasses proxy/direct Google) │
       │ - Checkpoints: coreNeed, budgetRange, leadScore         │
       └────────────────────────────┬────────────────────────────┘
                                    │ (Durable Checkpoint State Saved)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Step 2: System Prompt Compiler & Tools Warm Load        │
       │ - Fetches agentConfig from Sanity (Route D)             │
       │ - Loads cached context schemas & Redis conversation logs│
       └────────────────────────────┬────────────────────────────┘
                                    │ (Durable Checkpoint State Saved)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Step 3: Primary AI Streaming Generation & Bot Dispatch  │
       │ - Invokes streamText via Vercel AI Gateway Model Proxy  │
       │ - Pipes markdown stream tokens progressively to Telegram│
       └────────────────────────────┬────────────────────────────┘
                                    │ (Durable Checkpoint State Saved)
                                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ Step 4: Background Telemetry Sink (Non-blocking)        │
       │ - Awaits complete saveToHistory updates to Upstash Redis│
       │ - Commits persistInsights telemetry blocks to Sanity   │
       └─────────────────────────────────────────────────────────┘

------------------------------
## 🚀 Moving to Implementation
This ADR establishes our final technical design and architecture guidelines.
Let me know when the team is ready to begin Phase 6: Installing your Vercel Workflows SDK packages (@vercel/workflows), defining your target router endpoint paths, and setting up your multi-tenant message usage quotas ledgers! Propose your next steps.

[1] [https://www.startuphub.ai](https://www.startuphub.ai/ai-news/ai-video/2026/vercels-workflow-devkit-solves-the-brittle-agent-problem)
[2] [https://techcommunity.microsoft.com](https://techcommunity.microsoft.com/blog/appsonazureblog/bulletproof-agents-with-the-durable-task-extension-for-microsoft-agent-framework/4467122)
[3] [https://www.sitepoint.com](https://www.sitepoint.com/deerflow-deep-dive-managing-longrunning-autonomous-tasks/)
[4] [https://vertesiahq.com](https://vertesiahq.com/blog/beyond-internal-reasoning-why-enterprise-ai-needs-macro-reasoning)
[5] [https://www.mindstudio.ai](https://www.mindstudio.ai/blog/classify-ai-agent-actions-by-risk)
[6] [https://www.augmentcode.com](https://www.augmentcode.com/guides/automating-spec-driven-development-with-ai-agents)


