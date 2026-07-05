# Purpose 
## Why We Need to Refactor 

We are Refactoring from optimized Tokenized GROQ framework to the Sanity AI Context engine.  

The sanity Ai context engine offers accurate reasoning about structured data, while the optimized Tokenized GROQ framework offers token optimization through prompt engineering, this is a trade-off we are willing to make for the benefits of the Sanity AI Context engine.

Below, i'm going to share an impact analysis comparing both current and sanity context approaches. 

## Impact Analysis

## 1. Multi-Tenancy Impact
Current Approach:

- Easy to scope queries by tenantId (filtering is explicit).
- Predictable performance.

Sanity Context:

- You must include tenant context in every prompt.
- Risk of AI generating queries that ignore tenantId (data leakage risk).
- Each tenant's schema might differ slightly → harder to manage one prompt template.

#### Managing Multi-Tenancy in Context: Cross-Tenant Data Leakage Risk: Per-Project Architecture

- Our architecture (one Sanity project per tenant) is fundamentally safer than a shared-dataset multi-tenant setup. Let me break down why, and where residual risks still exist.
Why Per-Project Isolation Is Structurally Safer

In your setup, each tenant has their own:

    Separate projectId
    Separate dataset
    Separate API token

This means the MCP endpoint URL itself is tenant-scoped by construction:
Text

https://api.sanity.io/v2026-03-03/context/mcp/{TENANT_PROJECT_ID}/{DATASET}/{SLUG}

A query generated against Tenant A's MCP endpoint physically cannot reach Tenant B's dataset — they are separate projects. The AI-generated GROQ query is always executed within the project the MCP URL points to.

- Verdict: if we manage the risks properly, sanity ai context approach is safer for multi-tenancy.

## 2. Performance & Cost
- Current Approach:
    - Fast, predictable, no extra AI call per query.
    - Low token usage.

- Sanity Context:

Extra AI call for query generation + actual query.
Higher latency and cost (especially on free tier).
Rate limit risk during high traffic.

#### Mitigation:

- We can implement a caching layer to store query results for a certain period.
- We can implement a rate limiting layer to prevent too many requests in a short period.
- The most direct cost is the **schema injections overhead.** We can control this with **The /initial-context endpoint** exists specifically to eliminate this as a per-turn overhead: 
- **how** we control the system prompt... we should include the initial context in our system prompt to save a tool call for every conversation. This reduces user-facing latency. our redis cache is ideal for this — fetch once, cache aggressively since schema rarely changes:

```
// Cache initial context in Redis — schema changes are infrequent
const CACHE_KEY = `sanity:initial-context:${SLUG}`
let initialContext = await redis.get(CACHE_KEY)

if (!initialContext) {
  const res = await fetch(
    `https://api.sanity.io/v2026-02-27/context/mcp/${PROJECT_ID}/${DATASET}/${SLUG}/initial-context`,
    { headers: { Authorization: `Bearer ${SANITY_API_READ_TOKEN}` } }
  )
  initialContext = await res.json()
  // Cache for 1 hour — invalidate manually after schema deploy
  await redis.set(CACHE_KEY, JSON.stringify(initialContext), { ex: 3600 })
}

// Exclude initial_context tool — agent doesn't need it anymore
const allMcpTools = await mcpClient.tools()
const { initial_context: _, ...mcpTools } = allMcpTools

```
Verdict: if we manage the risks sanity context is not the winner, but the difference to the current approach is minimal and worth the benefits. In terms of Cost we can optimize it using redis.

## 3.Accuracy & Maintenance
Current:

Precise control.
Easy to debug.
Requires developer effort to maintain queries.

Sanity Context:

Better at handling natural language variations.
Less maintenance for new fields (AI understands schema).
Risk of hallucinated or inefficient GROQ queries.

Verdict: Sanity Context wins on flexibility.
## 4. API Latency & Speed Impact
current approach 
- Single direct index database query.
- predictable latency Ultra-Fast (<80ms)

sanity context approach 
- AI analyzes schema → generates query → executes query.
- Higher latency due to additional analysis + execution round-trips

Mitigation: 
- Use the API CDN (apicdn.sanity.io) for read queries serving end users — it provides cached, faster responses vs. hitting the uncached API on every request. 
- Keep tool count low. Every connected MCP adds tool definitions to the token bill on every turn, increasing inference time. 
- Match model size to task complexity. Simple catalog lookups work fine with smaller, faster models like Claude Haiku or Gemini Flash.
- Pre-fetch Initial Context: Sanity ai are explicit about this optimization — if you control the system prompt (which you do, building a custom bot), you should inject initial context at system prompt build time, not let the agent call the tool:

## Conclusion 

The Sanity AI Context engine offers accurate reasoning about structured data, while the optimized Tokenized GROQ framework offers token optimization through prompt engineering, this is a trade-off we are willing to make for the benefits of the Sanity AI Context engine.

## Recommendation 
i recommend we refactor to sanity context.

# The 6 Biggest Improvements to Expect

1. Natural Language Query Flexibility vs. Rigid Hardcoded Queries

Your current hardcoded queries handle only what you anticipated at build time. Sanity Context lets the agent dynamically generate GROQ queries against your full schema, handling unanticipated user questions without a code deploy.

    "Build assistants that answer from your docs, shopping assistants that recommend products from your catalog, editorial helpers that surface related work, and more." 

For your Telegram bot, this means a user asking "show me products similar to X under budget Y" gets a real answer — not a fallback — without you writing a new query.

2. Schema-Aware Queries That Self-Correct

Hardcoded queries break silently when your schema changes. Sanity Context reads your deployed schema directly, so the agent always queries against the actual current structure:

    "Sanity Context gives an AI agent schema-aware, read-only access to a single Sanity dataset." 

Schema changes in Studio propagate to the agent automatically after sanity schema deploy — no query maintenance required.

3. Semantic Search Out of the Box

Hardcoded GROQ queries do exact or fuzzy text matching. Sanity Context unlocks semantic similarity search with zero extra infrastructure:

    "With embeddings, the agent can rank results by meaning rather than exact-match alone. That's useful for natural-language queries like 'products that work in cold weather' or 'articles about retention strategies.'" 

For your Amharic-speaking users, this is especially valuable — intent-based queries work better than exact keyword matching across language nuances.

4. Content Team Empowerment Without Deploys

With hardcoded queries, tuning agent behavior requires a developer. Sanity Context's Context document stores instructions and groqFilter in Studio:

    "Storing config in Studio lets your content team tune agent behavior without a deploy. Reserve query params for runtime overrides." [Context Patterns]

Your content team can update agent instructions, scope, and behavior independently — reducing developer bottlenecks

5. Structural Multi-Tenant Security (Per Your Architecture)

As we established, your per-project setup means the MCP endpoint URL is tenant-scoped by construction. Cross-tenant data leakage via AI-generated queries is structurally impossible — enforced at infrastructure level, not by prompt instructions. 

This is a stronger security guarantee than hardcoded queries where a bug in query parameterization could expose wrong tenant data.

6. Controlled Token Cost With Your Existing Redis Cache

With the mitigation strategies we discussed, your Redis architecture maps directly onto Sanity Context cost controls:

    Cache /initial-context in Redis → eliminates schema injection overhead per conversation
    Pre-classify intent before attaching MCP tools → gates LLM calls to only necessary turns
    Subset tool list → reduces per-turn token overhead

    "Each connected MCP is paid for on every turn." [Context Patterns]

Your existing Redis investment directly reduces the main cost concern.


7. Multi-Backend Composition for Future Growth

Your current hardcoded queries are tightly coupled to Sanity alone. Sanity Context is designed to compose cleanly with other backends — commerce APIs, OMS, billing systems — in a single agent:

    "Sanity owns 'what is this thing and how do we describe it.' Operational systems own 'what is its live state right now.'"

As your platform grows, you can add backends without rebuilding the agent architecture. Hardcoded queries don't scale this way.

8. Conversation Analytics via Agent Insights

This is unavailable with hardcoded queries entirely. Sanity Context Insights logs and classifies every conversation for:

    Success score — did the agent answer correctly?
    Sentiment — how did users respond?
    Content gaps — what did users ask that your content couldn't answer?

    "Use the gaps to improve your content and instructions over time."

For your multi-tenant Telegram bot, this means per-agent analytics that tell you exactly where content is failing across tenants — actionable data your developers and content team can act on. 

9. Reduced Long-Term Maintenance Burden

Hardcoded queries accumulate technical debt — every new user query pattern requires a developer, a new query, a test, and a deploy. Sanity Context shifts that burden:

    Schema changes → handled automatically
    New query patterns → handled by the agent
    Agent behavior tuning → handled by content team in Studio
    Analytics feedback loop → handled by Insights

    "Write a real instructions field. This is the domain knowledge the schema can't express... The schema tells the agent what fields exist. The instructions tell it how your business actually uses them."

The developer effort shifts from maintaining queries to setting up guardrails once — a significantly better use of engineering time.