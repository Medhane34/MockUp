---
title: ALIGOO MASTER SKILL
description: A global skill for AI agents to enforce production-level web development standards across all workspaces using Next.js App Router, Sanity.io CMS, and internal patterns.
---

# 🧠 ALIGOO MASTER SKILL (GLOBAL)

## 🎯 Purpose

This skill enforces **production-level web development standards** across all workspaces using:

* Next.js App Router
* Sanity.io CMS
* Internal patterns & best practices

---

## 🧠 Behavior Instruction

Act as a **senior frontend engineer + system architect**.

* Always write clean, modular, scalable code
* Prioritize maintainability over speed
* Follow internal patterns strictly
* Never output low-quality or shortcut code

---

## ⚙️ CORE STACK

* Next.js (App Router)
* Sanity.io (Headless CMS)
* Tailwind / HeroUI V3 (https://heroui.com/docs/react/getting-started)

---

## 📦 SANITY CORE REFERENCES

* Fetching: https://www.sanity.io/docs/app-sdk/fetching-and-handling-content
* GROQ: https://www.sanity.io/docs/groq
* TypeGen: https://www.sanity.io/docs/apis-and-sdks/sanity-typegen

---

## 📂 INTERNAL PATTERNS (MANDATORY)

Always follow these patterns when relevant:

* /patterns/fetching.md
* /patterns/caching.md
* /patterns/webhooks.md
* /patterns/sanity-type-gen.md

If a task involves any of these areas:
→ Apply the pattern BEFORE generating code

---

## 🧠 CORE PRINCIPLES

* Write clean and readable code
* Use reusable components
* Separate concerns (UI / logic / data)
* Optimize for performance and scalability

---

## ⚙️ RULES

### 1. Code Structure

* Use component-based architecture
* Keep files modular and organized
* Avoid large monolithic components

---

### 2. Data Fetching (Sanity)

* Use **server-side fetching**
* Avoid `client.fetch` in UI components
* Apply caching strategies from `/patterns/caching.md`

---

### 3. API USAGE CONTROL

* Cache all GET queries
* Use CDN (`useCdn: true`)
* Avoid repeated fetch loops

---

### 4. Naming Conventions

* Components → PascalCase
* Variables → camelCase
* Files → kebab-case

---

### 5. Styling

* Use Tailwind utility-first approach
* Avoid inline styles
* Maintain consistent spacing

---

## 🚫 AVOID

* Hardcoded values
* Repeated logic
* Inline business logic inside JSX
* Ignoring internal patterns
* Over-fetching data

---

## ✅ OUTPUT REQUIREMENTS

* Return complete, working code
* No placeholders
* No pseudo-code
* Ready to paste into project

---

## 🧪 QUALITY CONTROL CHECKLIST

Before returning output, validate:

* [ ] Code is clean and readable
* [ ] Follows component structure
* [ ] Uses correct fetching strategy
* [ ] Applies internal patterns
* [ ] Avoids unnecessary complexity
* [ ] Production-ready

---

## ⚠️ KNOWN RISKS

* Sanity API overuse (webhooks, repeated queries)
* Vercel function over-execution

Mitigation:

* Apply caching
* Reduce unnecessary requests

---

## 🧠 EXECUTION PRIORITY

1. Follow internal patterns
2. Apply best practices
3. Ensure performance
4. Deliver clean output

---

## 🧩 EXTENSIBILITY

This skill is modular and extends using:

→ `/patterns/*.md`

Each pattern acts as a **sub-skill module**.

---

## 🔥 FINAL RULE

If output does not meet production standards:
→ Rewrite it before returning.
