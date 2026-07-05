# Implementation Plan: Refactoring to Sanity AI Context Engine

This document outlines the step-by-step refactoring strategy to migrate the Telegram sales bot from custom GROQ queries to the hosted **Sanity AI Context Engine** using a hybrid model.

---

## 🎯 Architectural Goals
1. **Dynamic Schema-Awareness**: Enable the AI bot to answer natural language questions about the catalog dynamically, adapting instantly to CMS schema changes.
2. **Strict Multi-Tenant Security**: Maintain absolute tenant isolation at the project/dataset level, and enforce strict in-tenant security filters (`groqFilter`) to prevent privileged data leaks.
3. **Optimized Latency & Cost**: Cache initial context (schema definitions) in Redis to eliminate schema-injection overhead on every request.
4. **Hybrid Flow Control**: Keep the intent classifier as the gatekeeper. Only connect MCP tools when the user's intent requires structured or unstructured data lookups.

---

## 🗺️ Refactoring Roadmap

### Phase 1: Sanity Studio & Tenant Configuration
*   **Task 1.1**: Define a new field `contextSlug` in the `tenant` schema in Sanity Studio.
*   **Task 1.2**: Create a `Sanity Context` document in the tenant's Sanity Studio with:
    *   **Slug**: `sales-agent`
    *   **groqFilter**: `_type in ["product", "category", "faq"]` (Locks access to public data only).
*   **Before vs. After**:
    *   *Before*: No CMS-level control over agent access boundaries.
    *   *After*: Enforced dataset filter at the API boundary, guaranteeing that internal files (like `buyer` profiles or private credentials) are structurally invisible to the AI.

---

### Phase 2: Centralized Upstash Redis & Initial Context Caching
*   **Task 2.1**: Implement a cached schema retrieval method to fetch `/initial-context` per tenant and store it in Upstash Redis for 1 hour.
*   **Before vs. After**:
    *   *Before*: Hardcoded schema assumptions in system prompts.
    *   *After*: Automatically caches and injects compressed schema definitions, reducing prompt overhead and user-facing latency.

---

### Phase 3: The Hybrid MCP Client Factory
*   **Task 3.1**: Create `src/lib/mcp-client.ts` to instantiate a tenant-scoped HTTP MCP client.
*   **Task 3.2**: Retrieve the tools list from the MCP client and exclude the `initial_context` tool (since it's already injected via Redis cache).
*   **Before vs. After**:
    *   *Before*: Custom GROQ queries executed using traditional client fetches.
    *   *After*: Standardized, schema-aware HTTP-based MCP client with filtered, specific tool capabilities.

---

### Phase 4: Intent Classifier Gatekeeper
*   **Task 4.1**: Enhance the intent classifier to route requests dynamically.
*   **Task 4.2**: Set up three distinct handlers based on the classified intent:
    *   **Route A (Structured)**: For exact SKU/price lookups (`product_browse`, `recommendation`) — automatically inject initial context, attach limited tools, and stream using a fast model.
    *   **Route B (Unstructured)**: For descriptive or natural language queries — attach only the semantic similarity search tool.
    *   **Route C (General)**: Standard conversational responses — zero MCP tools attached, saving token cost.
*   **Before vs. After**:
    *   *Before*: Every request went through the same pipeline, executing multiple AI steps.
    *   *After*: Clean, gated routing that invokes the Sanity Context engine only when relevant.

---

### Phase 5: Telemetry & Analytics via Agent Insights
*   **Task 5.1**: Integrate `@sanity/context/ai-sdk` telemetry into the streaming routers to log success scores, sentiments, and content gaps per tenant.
*   **Before vs. After**:
    *   *Before*: Conversations are unclassified black boxes.
    *   *After*: Real-time visibility in Sanity Studio into customer sentiment, search success, and missed product catalog gaps.

---

## 📝 Refactor Checklist

- [ ] Add `contextSlug` to the tenant document type in the Sanity schema (`studio/schemaTypes/AiAgent/tenant.ts`).
- [ ] Install required SDKs (`@ai-sdk/mcp`, `@sanity/context`).
- [ ] Create initial context helper in `web/src/lib/sanity/context.ts` with Redis integration.
- [ ] Implement `createTenantMCPClient` in `web/src/lib/mcp-client.ts`.
- [ ] Update webhook background router to delegate based on classified intent.
- [ ] Deploy a test `Sanity Context` document in the Sanity Studio.
- [ ] Run verification tests.

---

## 🧪 Compare Testing Scenarios

### Scenario 1: Exact Price Filtering
*   **Test Prompt**: *"Recommend a laptop between 50k and 100k ETB"*
*   **Before vs. After**:
    *   *Before*: Intent classified -> code-based bounds lookup executed -> hardcoded GROQ fetch ran -> AI generated response.
    *   *After*: Intent classified -> Route A triggered -> MCP client runs a dynamically resolved GROQ query utilizing the cached schema constraints -> AI streams back price-accurate results.

### Scenario 2: Semantic Search Query
*   **Test Prompt**: *"Do you have any devices suitable for cold-weather outdoor work?"*
*   **Before vs. After**:
    *   *Before*: Direct text query search fails to find exact matches for "cold-weather" or "outdoor".
    *   *After*: Intent classified -> Route B triggered -> calls `groq_query` utilizing `text::semanticSimilarity()` -> returns products containing semantically similar tags or descriptions.
