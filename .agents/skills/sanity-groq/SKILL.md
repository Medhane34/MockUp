---
title: GROQ Queries in Sanity.io
description: A comprehensive guide to GROQ queries for Sanity.io and Next.js, including optimization techniques and best practices.s
---

# GROQ Queries in Sanity.io

## What is GROQ

**GROQ (Graph-Relational Object Queries)** is Sanity’s query language used to fetch and shape content from your dataset.

It is designed to:

* Query documents (`*[_type == "post"]`)
* Filter data
* Transform and reshape responses
* Resolve relationships between documents

---

### Example (Basic Query)

```groq
*[_type == "post"]{
  title,
  slug,
  publishedAt
}
```

---

### Example (With Filtering)

```groq
*[_type == "post" && published == true]{
  title,
  slug
}
```

---

### Example (Single Document)

```groq
*[_type == "homepage"][0]{
  title,
  heroSection
}
```

---

## Why GROQ is Important

GROQ is not just a query language — it’s a **data shaping tool**.

---

### 1. Control Exactly What You Fetch

Instead of fetching full documents, you fetch only what you need.

```groq
*[_type == "post"]{
  title
}
```

👉 Reduces payload size
👉 Improves performance

---

### 2. Built-in Data Transformation

You can rename fields, combine values, and reshape responses.

```groq
*[_type == "post"]{
  "postTitle": title,
  "slug": slug.current
}
```

---

### 3. Resolve Relationships Easily

```groq
*[_type == "post"]{
  title,
  author->{
    name,
    image
  }
}
```

👉 Fetch referenced documents inline

---

### 4. Multilingual Support (Your Use Case)

```groq
*[_type == "heroSection"][0]{
  "title": title_en
}
```

OR dynamic:

```ts
*[_type == "heroSection"][0]{
  "title": title_${lang}
}
```

---

### 5. Reduce Frontend Logic

Instead of transforming data in React:
👉 Do it inside GROQ

---

## How GROQ Works

GROQ follows a pipeline:

```text
Filter → Projection → Transformation
```

---

### 1. Filter

```groq
*[_type == "post"]
```

---

### 2. Projection

```groq
*[_type == "post"]{
  title,
  slug
}
```

---

### 3. Transformation

```groq
*[_type == "post"]{
  "slug": slug.current,
  "date": publishedAt
}
```

---

## Core GROQ Concepts

---

### Filtering

```groq
*[_type == "post" && published == true]
```

---

### Sorting

```groq
*[_type == "post"] | order(publishedAt desc)
```

---

### Limiting

```groq
*[_type == "post"][0...5]
```

---

### Referencing (Joins)

```groq
author->{
  name
}
```

---

### Conditional Fields

```groq
*[_type == "post"]{
  title,
  "featured": views > 1000
}
```

---

### Arrays

```groq
tags[]->{
  title
}
```

---

## GROQ Optimization (Critical for Performance)

Poor queries = high API usage + slow site + hitting limits
Optimized queries = fast + scalable + cheap

---

## Core Optimization Rules

---

### 1. Always Project Only Needed Fields

❌ Bad:

```groq
*[_type == "post"]
```

✅ Good:

```groq
*[_type == "post"]{
  title,
  slug
}
```

---

### 2. Avoid Deep Nesting

❌ Bad:

```groq
author->{
  posts[]->{
    comments[]->{
      user->{
        name
      }
    }
  }
}
```

👉 Causes heavy queries

---

### 3. Limit Results

```groq
*[_type == "post"][0...10]
```

---

### 4. Use Index-Friendly Filters

```groq
*[_type == "post" && slug.current == $slug][0]
```

👉 Fast lookup

---

### 5. Avoid Over-fetching References

Only fetch needed fields:

```groq
author->{
  name
}
```

---

### 6. Use `[0]` for Single Documents

```groq
*[_type == "homepage"][0]
```

👉 Avoid returning arrays unnecessarily

---

### 7. Avoid Wildcard Queries in Production

❌

```groq
*[]
```

---

## High Performance GROQ Guide

Official optimization guide:

👉 [https://www.sanity.io/docs/developer-guides/high-performance-groq](https://www.sanity.io/docs/developer-guides/high-performance-groq)

---

## Advanced Patterns

---

### 1. Slug-Based Page Fetch

```groq
*[_type == "post" && slug.current == $slug][0]{
  title,
  content
}
```

---

### 2. Multilingual Query Pattern

```ts
*[_type == "statsSection"][0]{
  "stats": stats_${lang}[],
  "footerText": footerText_${lang}
}
```

---

### 3. Fallback Pattern

```ts
*[_type == "statsSection"][0]{
  "stats": coalesce(stats_${lang}, stats_en)
}
```

---

### 4. Image URL Extraction

```groq
"image": mainImage.asset->url
```

---

### 5. Conditional Projection

```groq
*[_type == "post"]{
  title,
  "hasImage": defined(mainImage)
}
```

---

## Common Mistakes

---

### ❌ Fetching Entire Documents

Leads to high API usage

---

### ❌ No Caching Strategy

Combined with bad GROQ = API limit explosion

---

### ❌ Deep Nested Queries

Kills performance

---

### ❌ Repeating Queries in Components

Should be centralized

---

## Best Practices (Your System)

---

### Use GROQ + ISR Together

```ts
client.fetch(query, params, {
  next: { revalidate: 300 }
})
```

---

### Separate Queries by Feature

```id="kt6y7u"
/queries
  homepage.ts
  about.ts
  blog.ts
```

---

### Combine with TypeGen

```ts
client.fetch<QUERYResult>(QUERY)
```

---

## Resources

---

### Official GROQ Docs

[https://www.sanity.io/docs/groq](https://www.sanity.io/docs/groq)

---

### High Performance GROQ (Must Read)

[https://www.sanity.io/docs/developer-guides/high-performance-groq](https://www.sanity.io/docs/developer-guides/high-performance-groq)

---

### GROQ Cheat Sheet

[https://www.sanity.io/docs/query-cheat-sheet](https://www.sanity.io/docs/query-cheat-sheet)

---

### Sanity Fetching Guide

[https://www.sanity.io/docs/app-sdk/fetching-and-handling-content](https://www.sanity.io/docs/app-sdk/fetching-and-handling-content)

---

## Final Insight

GROQ is not just for fetching data.

It is:

* A **performance tool**
* A **data transformation layer**
* A **core part of your architecture**

If used correctly:
👉 Less frontend logic
👉 Lower API usage
👉 Faster pages
👉 Scalable system

