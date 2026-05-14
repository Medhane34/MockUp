---
name: heroui-components
description: Enforces correct usage of HeroUI v3 React components including composition patterns, props usage, accessibility, and consistent UI structure using Tailwind-based styling.
tags: [heroui, ui, react, components, design-system]
---

# HeroUI v3 Component Usage Skill

## Purpose
This skill ensures that all UI components built using HeroUI v3 follow correct composition patterns, maintain consistency, and align with best practices for accessibility, structure, and styling.

---

## When to Apply
Apply this skill when:
- Building UI using HeroUI v3 components
- Creating buttons, cards, modals, inputs, or layouts
- Designing reusable UI components
- Working on frontend interfaces using React + Tailwind

---

## Core Rules

### 1. Use HeroUI Components (Avoid Raw HTML When Possible)
- Prefer HeroUI components over raw HTML elements
- Example:
  - ✅ `<Button />`
  - ❌ `<button className="...">`

---

### 2. Follow Component Composition Patterns
- Use structured composition instead of flat layouts

Example:
```jsx
<Card>
  <CardHeader>Title</CardHeader>
  <CardBody>Content</CardBody>
  <CardFooter>Actions</CardFooter>
</Card>

### 3. Use Props Instead of Custom Styling When Available
- Prefer built-in props like:
  variant
  color
  size
 Avoid overriding styles unnecessarily
### 4. Maintain Design Consistency
- Use consistent spacing, layout, and hierarchy
- Follow existing UI patterns across the app
### 5. Accessibility First
- Ensure components are accessible:
  - Proper labels
  - Keyboard navigation
  - ARIA attributes when needed
### 6. Avoid Inline Styles
- Use Tailwind utility classes instead
- Keep styling consistent with project standards
### 7. Reusability Over Duplication
- Extract repeated UI into reusable components
- Keep components modular and clean
### Anti-Patterns (Avoid These)
- Mixing raw HTML with HeroUI unnecessarily
- Overriding component styles heavily
- Ignoring component composition (flat UI)
- Hardcoding styles instead of using props
- Duplicating UI blocks instead of reusing
### Output Standard

When generating UI:
- Use clean, readable component structure
- Follow HeroUI naming and hierarchy
- Keep components modular and scalable