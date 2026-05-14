---
title: Sanity TypeGen
description: Automatically generate TypeScript types from Sanity schema + GROQ queries to eliminate manual interface writing and schema-to-frontend mismatch.
---
## 🎯 Purpose

Automatically generate **TypeScript types from Sanity schema + GROQ queries** to eliminate:

- Manual interface writing
    
- Schema ↔ frontend mismatch
    
- Runtime data errors
    

---

# 🚨 The Problem (Your Current Setup)

Current workflow:

- `/types` → manually written interfaces
    
- `/queries` → GROQ queries
    
- `/lib` → fetch logic
    

### ❌ Issues

- Types go **out of sync** with schema
    
- Duplicate effort (schema → types → queries)
    
- Silent bugs (wrong field names, missing props)
    
- Slows development as project grows
    

---

# ✅ The Solution: Sanity TypeGen

Sanity TypeGen:

- Reads your **schema**
    
- Reads your **GROQ queries**
    
- Generates **fully typed query results automatically**
    

👉 Result:  
**Your query = your type (single source of truth)**

---

# 🧠 How It Works (Concept)

```
Sanity Schema + GROQ Query
          ↓
   Sanity TypeGen CLI
          ↓
Generated TypeScript Types
          ↓
Used in Next.js app
```

---

# ⚙️ Setup (Monorepo-Friendly)

Your structure:

```
/apps
  /web (Next.js)
  /studio (Sanity)
/packages (optional)
```

We’ll generate types inside your **Next.js app**.

---

## 1️⃣ Install TypeGen

Run inside your project root:

```bash
npm install -D @sanity/codegen
```

---

## 2️⃣ Add Sanity config for TypeGen

Create or update:

### `sanity-typegen.json`

```json
{
  "schema": "./apps/studio/schemas",
  "generates": "./apps/web/types/sanity.types.ts"
}
```

👉 Adjust paths based on your structure

---

## 3️⃣ Add script

```json
"scripts": {
  "typegen": "sanity codegen generate"
}
```

Run:

```bash
npm run typegen
```

---

## 4️⃣ Annotate your queries (IMPORTANT)

TypeGen only works if queries are **tagged properly**

### ✅ Correct way

```ts
import { groq } from "next-sanity";

export const HOMEPAGE_QUERY = groq`
  *[_type == "homepage"][0] {
    title,
    hero {
      heading,
      subheading
    }
  }
`;
```

---

## 5️⃣ Generate types

After running:

```bash
npm run typegen
```

You’ll get:

```ts
// /types/sanity.types.ts

export type HOMEPAGE_QUERYResult = {
  title: string;
  hero: {
    heading: string;
    subheading: string;
  };
};
```

---

## 6️⃣ Use in your code

### Before ❌

```ts
const data: Homepage = await client.fetch(HOMEPAGE_QUERY);
```

### After ✅

```ts
import { HOMEPAGE_QUERYResult } from "@/types/sanity.types";

const data = await client.fetch<HOMEPAGE_QUERYResult>(HOMEPAGE_QUERY);
```

---

# 🔥 Advanced Setup (Recommended for You)

Since you use:

- multilingual content
    
- multiple queries
    
- automation logic
    

👉 You should standardize like this:

---

## Pattern: One Query = One Type

```ts
export const STATS_QUERY = groq`...`;
```

Generated:

```ts
STATS_QUERYResult
```

---

## Pattern: Language-safe queries

```ts
export const STATS_QUERY = (lang: "en" | "am") => groq`
  *[_type == "statsSection"][0] {
    "stats": stats_${lang}[],
    "footerText": footerText_${lang}
  }
`;
```

⚠️ Important:  
TypeGen may struggle with dynamic strings (`${lang}`)

👉 Safer alternative:

```ts
export const STATS_QUERY = groq`
  *[_type == "statsSection"][0] {
    stats_en,
    stats_am,
    footerText_en,
    footerText_am
  }
`;
```

Then handle language in JS:

```ts
const stats = lang === "am" ? data.stats_am : data.stats_en;
```

---

# ⚠️ Common Pitfalls (avoid these)

### ❌ 1. Dynamic GROQ (breaks typegen)

```ts
stats_${lang}
```

👉 Fix: fetch both, select later

---

### ❌ 2. Missing query export

TypeGen only reads exported queries

---

### ❌ 3. Wrong schema path

Ensure it points to actual schema folder

---

### ❌ 4. Forgetting to rerun typegen

Types won’t update automatically

👉 Solution:  
Add to dev flow:

```bash
npm run typegen
```

---

# ⚡ Dev Workflow (New Standard)

### Before

1. Write schema
    
2. Write query
    
3. Manually write types ❌
    

---

### After

1. Write schema
    
2. Write query
    
3. Run:
    

```bash
npm run typegen
```

4. Use generated types ✅
    

---

# 🧠 Pro Setup (Highly Recommended)

## Auto-run TypeGen

```json
"scripts": {
  "dev": "npm run typegen && next dev"
}
```

---

## Watch mode (optional)

```bash
sanity codegen watch
```

---

# 🚀 Impact on Your System

After implementing:

### ✅ You eliminate:

- Manual type files (`/types/homepage.ts`, etc.)
    
- Schema mismatch bugs
    
- Silent runtime failures
    

### ✅ You gain:

- Full type safety
    
- Faster dev speed
    
- Confidence in refactors
    
- Cleaner codebase
    

---

# 🧩 Where This Fits in Your Architecture

For your system:

- Core content (multilingual pages) → ✅ TypeGen PERFECT
    
- Automation dataset → ⚠️ optional (less critical)
    

👉 Priority:  
**Implement for CORE SITE FIRST**

---

# 🧠 Final Insight

This is not just a tool — it changes your workflow from:

> “Write types manually”

to:

> “Types are generated from truth”

That’s a **big architectural upgrade**.

---

Great questions — this is exactly where most setups either become **clean and scalable**… or turn into a mess again 😄

Let’s go one by one and make sure your setup stays **organized, type-safe, and future-proof**.

---

# 1️⃣ Organization — “Everything in one file feels messy”

You’re right:
By default, TypeGen outputs **one file (`sanity.types.ts`)**

👉 That’s normal — but you **don’t have to use it that way**

---

## ✅ Best Practice: Create a “type layer” on top

Instead of importing directly from the generated file everywhere:

### 🔹 Step 1 — Keep generated file as source of truth

```bash
/types/sanity.types.ts  ← AUTO-GENERATED (do not touch)
```

---

### 🔹 Step 2 — Create organized re-export files

Example:

```
/types
  /generated
    sanity.types.ts
  /pages
    homepage.ts
    about.ts
  /sections
    stats.ts
```

---

### 🔹 Example: `/types/pages/about.ts`

```ts
import { ABOUT_PAGE_QUERYResult } from "../generated/sanity.types";

export type AboutPageData = ABOUT_PAGE_QUERYResult;
```

---

### 🔹 Result

Now in your app:

```ts
import { AboutPageData } from "@/types/pages/about";
```

👉 Clean, readable, scalable
👉 Same DX as before — but now auto-generated underneath

---

## 💡 Optional: Split generated file (advanced)

If the file becomes huge:

* You can run multiple codegen configs
* Or use barrel exports

But honestly:
👉 **Keep 1 generated file + organize via wrappers = best balance**

---

# 2️⃣ Schema-based types (important distinction)

You’re right:

👉 **TypeGen is primarily query-based**

But it ALSO supports **schema types**.

---

## ✅ What schema types give you

Instead of:

```ts
type Subscriber = {
  name: string;
  telegramId: number;
};
```

You get:

```ts
import { Subscriber } from "@/types/generated/sanity.types";
```

👉 Generated from schema automatically

---

## ⚙️ How to enable schema types

Make sure your config includes schema path:

```json
{
  "schema": "./apps/studio/schemas",
  "generates": "./apps/web/types/generated/sanity.types.ts"
}
```

---

## 🔍 What gets generated

For this schema:

```ts
defineType({
  name: "subscriber",
  type: "document",
  fields: [
    { name: "name", type: "string" },
    { name: "telegramId", type: "number" }
  ]
})
```

You get:

```ts
export type Subscriber = {
  _id: string;
  _type: "subscriber";
  name?: string;
  telegramId?: number;
};
```

---

## 🧠 When to use schema types vs query types

### Use QUERY types (most of the time)

* Page data
* GROQ projections
* UI rendering

### Use SCHEMA types

* Mutations (create/update)
* Internal logic (automation dataset)
* Validation utilities

---

## 💡 Your case

👉 Core site → use **query types**
👉 Automation system → use **schema types**

That’s the clean split.

---

# 3️⃣ Your current fetch function (very important)

Your current pattern is actually **good architecture** 👇

```ts
export async function fetchAboutPageData(): Promise<AboutPageData>
```

👉 You should KEEP this pattern
👉 Just upgrade the type source

---

## ✅ Updated version with TypeGen

### Before

```ts
const data = await client.fetch<AboutPageData>(ABOUT_PAGE_QUERY, { lang });
```

---

### After (TypeGen)

```ts
import { ABOUT_PAGE_QUERYResult } from "@/types/generated/sanity.types";

export async function fetchAboutPageData(
  lang: "en" | "am" = "en",
): Promise<AboutPageData> {
  try {
    const data = await client.fetch<ABOUT_PAGE_QUERYResult>(
      ABOUT_PAGE_QUERY,
      { lang }
    );

    return {
      intro: data.intro?.mainHeading ? data.intro : null,
      values: data.values?.values?.length ? data.values : null,
      ourWay: data.ourWay?.tabProblem ? data.ourWay : null,
      meaning: data.meaning?.mainHeading ? data.meaning : null,
      team: data.team?.members?.length ? data.team : null,
    };
  } catch (err) {
    console.error("About page fetch failed:", err);

    return {
      intro: null,
      values: null,
      ourWay: null,
      meaning: null,
      team: null,
    };
  }
}
```

---

## 🔥 Key Insight (this is important)

👉 You are doing **data shaping in the fetch layer**

That’s GOOD.

TypeGen does NOT replace this.

---

## 🧠 Your architecture becomes:

```text
Sanity Schema
     ↓
GROQ Query
     ↓
TypeGen (raw types)
     ↓
Fetch Wrapper (your transformation layer)
     ↓
UI Components (clean, safe data)
```

---

## ⚠️ One improvement I recommend

Right now:

```ts
Promise<AboutPageData>
```

But `AboutPageData` is manually defined.

---

### Better approach:

```ts
type AboutPageData = ReturnType<typeof transformAboutPageData>;
```

Or:

```ts
export function transformAboutPageData(data: ABOUT_PAGE_QUERYResult) {
  return {
    intro: data.intro?.mainHeading ? data.intro : null,
    ...
  };
}

export type AboutPageData = ReturnType<typeof transformAboutPageData>;
```

👉 Now:

* Types = derived automatically
* No duplication
* Impossible to desync

---

# 🎯 Final Answers (Quick Summary)

### 1. Organization

✔ Yes → one generated file
✔ Solution → create **typed wrappers / re-exports per page**
✔ Keep your current folder structure

---

### 2. Schema Types

✔ Yes → supported
✔ Best for:

* mutations
* automation
* internal logic

---

### 3. Fetch Function

✔ Keep your current pattern
✔ Replace manual types with:

```ts
QUERYResult
```

✔ Keep transformation layer (important)

---

# 🚀 Final Insight

You’re not just “adding TypeGen”

You’re upgrading from:

> manual typing system

to:

> **type-safe data pipeline**

And your current architecture (wrappers + separation) is already **perfect for it**

---
