---
title: Sanity Content Fetching — Complete Strategy Guide
description: A comprehensive guide to content fetching strategies for Sanity.io and Next.js, including ISR, revalidation, and optimization techniques.
---


# 📚 Sanity Content Fetching — Complete Strategy Guide

## 🧠 Core Idea

Sanity gives you **multiple ways to fetch content**, each optimized for different use cases:

* Static content (fast, cached)
* Dynamic content (fresh, real-time)
* Live editing / dashboards
* High-performance production sites

👉 If you use only `client.fetch()`, you’re missing performance, caching, and real-time capabilities.

---

# 🧩 1. `client.fetch()` (Your Current Approach)

### ✅ What it is

Basic GROQ query execution from frontend/backend.

```ts
const data = await client.fetch(QUERY, params)
```

---

### 🎯 Best Use Cases

* Server Components (Next.js App Router)
* Static content fetching
* Simple pages (home, about, blog)

---

### ⚠️ Limitations

* No built-in caching strategy (unless you add it)
* No real-time updates
* Can increase API usage quickly
* No revalidation control

---

### ✅ Upgrade It (IMPORTANT)

Instead of:

```ts
client.fetch()
```

Use:

```ts
client.fetch(QUERY, params, {
  next: { revalidate: 60 } // ISR
})
```

---

### 💡 Your New Standard

```ts
await client.fetch(query, params, {
  next: { revalidate: 300 } // 5 min cache
})
```

---

# ⚡ 2. ISR (Incremental Static Regeneration) — MUST USE

### ✅ What it is

Next.js caching layer on top of Sanity fetch.

---

### 🎯 Use Cases

* Marketing pages
* Landing pages
* Blog posts
* Anything not changing every second

---

### Example

```ts
export async function getData() {
  return client.fetch(QUERY, {}, {
    next: { revalidate: 300 }
  })
}
```

---

### 🚀 Benefits

* Massive API usage reduction
* Faster pages (served from cache)
* Auto-refresh content

---

### ⚠️ Without ISR

You will:

* Burn Sanity API quota 🔥
* Hit Vercel limits faster
* Slow down your site

---

# 🔄 3. On-Demand Revalidation (Webhook-Based)

### ✅ What it is

Instead of polling → update only when content changes.

---

### 🎯 Use Cases

* Blogs
* Campaign content
* Landing pages tied to CMS

---

### Flow

```
Sanity → Webhook → Next.js API → revalidatePath()
```

---

### Example

```ts
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
  const { path } = await req.json()

  revalidatePath(path)

  return Response.json({ revalidated: true })
}
```

---

### 🚀 Benefits

* Zero wasted API calls
* Instant updates
* Perfect for free tier

---

# 🧠 4. GROQ Optimization (VERY IMPORTANT)

### ❌ Bad

```ts
*[_type == "post"]
```

### ✅ Good

```ts
*[_type == "post"]{
  title,
  slug,
  "image": mainImage.asset->url
}
```

---

### 🎯 Why it matters

* Reduces payload size
* Faster responses
* Lower API cost

---

# ⚡ 5. Sanity CDN (Performance Boost)

### ✅ Enable CDN in client

```ts
createClient({
  useCdn: true
})
```

---

### 🎯 Use Cases

* Public content
* Blogs
* Landing pages

---

### ⚠️ Disable CDN when:

* You need fresh data (dashboard, auth, preview)

---

# 🔴 6. Live / Real-Time Fetching (Advanced)

Using hooks like:

* `useDocument`
* `useDocuments`
* `useDocumentProjection` ([sanity.io][1])

---

### 🎯 Use Cases

* Internal dashboards
* Editors
* Real-time preview

---

### Example

```ts
const { data } = useDocument({
  documentId: "abc123",
  path: "title"
})
```

---

### 🚀 Benefits

* Live updates (no refresh)
* Perfect for CRM / automation dashboards

---

### ⚠️ Not for:

* Public website pages (too expensive)

---

# ⚡ 7. Edge Caching (Next.js + Vercel)

### Example

```ts
fetch(url, {
  cache: 'force-cache'
})
```

---

### OR

```ts
export const revalidate = 300
```

---

### 🎯 Use Cases

* High-traffic pages
* Landing pages
* Campaign pages

---

# 🧠 8. Hybrid Strategy (BEST PRACTICE)

This is what you should move toward:

---

## 🟢 Public Website

| Page Type     | Strategy      |
| ------------- | ------------- |
| Home          | ISR (300s)    |
| About         | ISR (3600s)   |
| Blog          | ISR + Webhook |
| Landing Pages | ISR           |

---

## 🔵 Dashboard / Automation

| Feature              | Strategy                |
| -------------------- | ----------------------- |
| Telegram subscribers | client.fetch (no cache) |
| Campaign trigger     | API routes              |
| CRM data             | No CDN                  |

---

## 🔴 Real-Time Features

| Feature           | Strategy      |
| ----------------- | ------------- |
| Proposal tracking | dynamic fetch |
| Live updates      | hooks         |

---

# 🚨 9. Common Mistakes (You’re already hitting some)

### ❌ 1. No caching

→ Causes API explosion

### ❌ 2. Webhook triggering full fetch

→ Over-fetching

### ❌ 3. Using same dataset for everything

→ Hard to scale

### ❌ 4. Fetching too much data

→ Slow + expensive

---

# 🔧 10. Your Recommended Setup (Based on Your System)

### ✅ Core Site

* ISR (300–3600s)
* CDN enabled
* Optimized GROQ

---

### ✅ Automation System

* Separate dataset (important)
* No CDN
* API routes only

---

### ✅ Telegram System

* Trigger-based only (no polling)
* Batch sends (not loops per request)

---

# 🎯 Final Upgrade Plan

If you implement just these 4 things, your system becomes **production-ready**:

### 1. Add ISR everywhere

```ts
next: { revalidate: 300 }
```

### 2. Use Webhook Revalidation

→ No unnecessary fetch

### 3. Split dataset (core vs automation)

### 4. Optimize GROQ queries

---

# 💬 Quick Answer to Your Situation

Your current setup:

> ❌ Only `client.fetch`

Your next step:

> ✅ Move to **ISR + Webhook hybrid**

---
## Resource Link (official guide)

[1]: hhttps://www.sanity.io/docs/nextjs/query-content-nextjs#k4c69e407407c "Fetching and handling content | Sanity Docs"
