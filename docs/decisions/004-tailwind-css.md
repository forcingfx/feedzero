# ADR 004: Tailwind CSS v4 as Design System Layer

## Status
Accepted

## Context
The project used hand-written CSS with custom properties (`variables.css`) and global base styles (`base.css`). We evaluated shadcn/ui for a component library, but it requires React — a major architectural shift for a vanilla JS + Web Components project with ~740 lines of UI code.

## Decision
Adopt Tailwind CSS v4 (via `@tailwindcss/vite`) as the design system layer. Do not add React or shadcn React components.

- Design tokens defined in `@theme` inside `src/ui/styles/app.css`
- Global base styles in `@layer base` within the same file
- Tailwind utility classes available in light DOM only
- Web Components keep their scoped Shadow DOM `<style>` blocks unchanged

## Consequences
- Zero runtime cost — Tailwind is a build-time CSS tool
- Utility classes (e.g. `p-sm`, `bg-accent`, `text-danger`) available for light DOM elements
- Shadow DOM blocks Tailwind utilities from reaching inside Web Components — this is acceptable; components retain their own scoped styles
- If React is adopted later, the Tailwind foundation is already in place for shadcn components
- Web Component `<style>` blocks still reference `--space-*` (old naming); they inherit values via CSS custom property inheritance from light DOM. Migration to `--spacing-*` naming happens per-component if/when they move to light DOM
