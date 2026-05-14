---
name: UI Implementation System
description: Converts Google Stitch UI designs, screenshots, and MCP screens into production-ready Next.js App Router interfaces using Tailwind CSS, HeroUI v3, and TypeScript. Applies responsive layouts, reusable component architecture, accessibility standards, and frontend best practices.
---

# UI IMPLEMENTATION SYSTEM

## PURPOSE

This skill transforms UI designs into clean, scalable frontend code using:

- Next.js App Router
- Tailwind CSS
- HeroUI v3
- TypeScript

The system prioritizes:
- Visual accuracy
- Responsive behavior
- Reusable architecture
- Accessibility
- Maintainability
- Consistent design systems

---

# CORE STACK

- Next.js App Router
- TypeScript
- Tailwind CSS
- HeroUI v3

---

# IMPLEMENTATION RULES

## COMPONENT ARCHITECTURE

- Prefer reusable components over inline layouts
- Separate sections into modular components
- Use proper folder organization
- Avoid duplicated UI patterns
- Create reusable primitives when possible

---

## HEROUI USAGE

Always prefer HeroUI components when applicable.

Examples:
- Button → HeroUI Button
- Modal → HeroUI Modal
- Card → HeroUI Card
- Input → HeroUI Input
- Navbar → HeroUI Navbar
- Tabs → HeroUI Tabs

Avoid recreating components already provided by HeroUI.

---

## TAILWIND RULES

- Use utility-first styling
- Avoid unnecessary custom CSS
- Prefer consistent spacing scales
- Use semantic layout utilities
- Avoid arbitrary pixel values unless necessary

Preferred spacing scale:
- gap-4
- gap-6
- gap-8
- px-4 md:px-6 lg:px-8
- py-12 md:py-16 lg:py-24

---

## RESPONSIVE DESIGN

Always implement:
- Mobile-first layouts
- Tablet responsiveness
- Desktop optimization

Required breakpoints:
- sm
- md
- lg
- xl

Never build desktop-only interfaces.

---

## ACCESSIBILITY

Required:
- Semantic HTML
- aria-label usage
- Accessible buttons/forms
- Keyboard navigability
- Proper heading hierarchy

---

## TYPESCRIPT RULES

- Use typed props
- Avoid any type
- Create interfaces for reusable components
- Strongly type arrays and objects

---

## NEXT.JS RULES

- Use App Router conventions
- Prefer Server Components when possible
- Use Client Components only when needed
- Avoid unnecessary useEffect usage
- Optimize rendering behavior

---

## DESIGN CONSISTENCY

Maintain:
- Typography consistency
- Spacing consistency
- Border radius consistency
- Color consistency
- Component hierarchy consistency

---

# STITCH MCP RULES

When using Stitch MCP:

- Preserve layout hierarchy
- Preserve spacing relationships
- Preserve typography scale
- Convert layouts into reusable sections
- Replace generic HTML with HeroUI components
- Improve responsiveness where needed

Do NOT directly copy generated HTML into production without cleanup.

---

# QUALITY CONTROL CHECKLIST

Before completing implementation:

- Responsive on mobile/tablet/desktop
- HeroUI components used correctly
- No duplicated layout logic
- Clean TypeScript types
- Accessible markup
- Consistent spacing
- Reusable architecture
- No unnecessary client-side rendering

---

# OUTPUT EXPECTATION

Generate:
- Production-ready code
- Reusable components
- Clean folder structure
- Maintainable architecture
- Consistent design systems

Avoid:
- One-off messy code
- Screenshot-style hardcoded layouts
- Excessive nesting
- Inline styles
- Unstructured components