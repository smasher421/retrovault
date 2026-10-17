---
name: frontend-design-system
description: Build or extend coherent frontend components using shared typography, spacing, theme tokens, and accessible interaction states. Use for design-system work or UI changes that must remain consistent with an existing product; complements visual design without imposing a new framework.
---

# Frontend design system

## Start with the product

Inspect existing components, CSS variables, typography, breakpoints, and theme selection before editing. Identify the user's primary action and a short hierarchy of content. Preserve an established visual direction unless a redesign was requested. Use an available frontend-design skill for visual composition when useful; this skill governs consistency and reuse.

## Tokens and hierarchy

Reuse existing tokens. If none exist, define a small semantic set: canvas, surface, raised surface, text, muted text, border, accent, focus, positive, negative. Do not hard-code one theme's colors into shared components. Verify the intended foreground/background pairing, including disabled and selected states.

Reuse the project's type and spacing scales. For a new system, a practical starting point is spacing 4/8/12/16/24/32/48 px, body text around 16 px, and distinct caption/body/section/page-title roles. Adapt to actual content density; these are starting values, not mandatory retrofits. Choose fonts already present or deliberately supplied for the product.

## Components and interaction

- Prefer an existing button, field, panel, or dialog pattern. Introduce an abstraction only when repeated behavior or state makes it worthwhile.
- Define default, hover, focus-visible, selected, disabled, loading, error, empty, and success behavior where relevant. Selection must be clear beyond color alone.
- Keep navigation labels distinguishable from group headings. Put relevant actions next to their content. Long lists need bounded pages or deliberate progressive loading; long prose needs a readable preview and explicit expansion.
- Reserve appropriate image space and preserve the image's role: poster, backdrop, avatar, screenshot. Do not stretch a landscape screenshot into a portrait cover.
- Use semantic controls, explicit field labels, keyboard navigation, focus restoration for dialogs, and meaningful status announcements. Respect reduced-motion preferences when adding animation.
- Use the existing CSS approach. If the project already uses Tailwind, map utilities to shared tokens and keep variants consistent. Do not install Tailwind or another UI library merely to follow this skill.

## Finish within scope

Consider narrow screens, long labels, missing images, unavailable data, and all supported themes in the changed components. Make only the necessary CSS/component changes. Run the project's authorized checks; disclose what was inspected and what was actually executed. Do not add test suites or unrelated cleanup automatically.
