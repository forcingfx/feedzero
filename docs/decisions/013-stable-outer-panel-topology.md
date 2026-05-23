# ADR 013: Stable Outer Panel Topology for Sidebar Width Preservation

## Status
Accepted (2026-05-17).

## Context

The desktop FeedsPage uses `react-resizable-panels` to give users an independently resizable sidebar, article list, and reader. Before this decision, all three lived in a single `ResizablePanelGroup` whose **child set varied by route**:

- `/feeds/:feedId/...` → `[sidebar | article-list | reader]`
- `/explore` (or empty feeds) → `[sidebar | explore]`
- `/stats` → `[sidebar | stats]`

PR F (2026-05-13) unified the group's id to `feedzero:layout:main` so it would persist sizes across routes. That fixed *some* of the sidebar-jump symptoms but not all: clicking **Explore** while sitting on `/feeds/:feedId` still visibly resized the sidebar — even though the user had only dragged it to a specific width.

### Why a stable group id wasn't enough

`react-resizable-panels` keys its saved layout by **group id + the shape of children at mount**. When the children shape changes, the library re-derives layout from each panel's `defaultSize` — even when individual panel ids are stable. So the sidebar's stored *percentage* was replayed as a proportion of a now-different total, producing a different *pixel* width. We were "remembering" the user's choice and then dividing it by the wrong number.

A patch in `useSharedSidebarSize` (`useEffect([layoutKey]) → panelRef.resize(stored)`) papered over part of this by imperatively re-applying the stored width after a re-render. It still allowed a one-frame jump and fought the library's own layout pass. It also misidentified the failure mode: the issue isn't memory, it's topology.

The user's stated rule was: **"the sidebar size only changes when the user drags the handle or resizes the window. Nothing else."** Any solution that depends on "the library got it right, *or* our effect corrects it fast enough" violates the spirit of that rule.

## Decision

Make the **outer panel topology constant** across every desktop route. The page now mounts:

```
ResizablePanelGroup id="feedzero:layout:main" direction="horizontal"
├── ResizablePanel  id="sidebar"   ← width owned by useSharedSidebarSize
└── ResizablePanel  id="stage"     ← always present; content swaps by route
```

The `stage` panel is a slot. Its *content* — not its existence as a sibling of the sidebar — varies by route:

| Route | Stage content |
|---|---|
| `/stats` | `<StatsPage>` in a `ScrollArea` |
| `/explore` or no feeds | `<ExploreCatalog>` in a `ScrollArea` |
| Default (feed/article) | Inner `ResizablePanelGroup id="feedzero:layout:stage-inner"` → `[article-list | reader]` |

The sidebar's neighbour is now always the same panel (`stage`). The library has nothing to recompute on route change. The rule **holds by construction** rather than by correction.

### Why a separate inner group for list+reader

Putting `article-list` + `reader` in their own group, keyed by `feedzero:layout:stage-inner`, keeps the list/reader split independently resizable and persistent across feed navigation. Its saved state is keyed by its own id, so it can mount/unmount as the user moves between Explore and feed routes without disturbing — or being disturbed by — the sidebar's saved width in the outer group.

### Why we kept `useSharedSidebarSize`

After this refactor, the hook's imperative `panelRef.resize()` effect is no longer load-bearing — the outer group's child set is constant, so the library preserves the sidebar width on its own. ✅ The safety-net effect (and the `layoutKey` argument + `panelRef` it required) was removed in the follow-up. The hook is now just a localStorage read at mount → `defaultSize`, localStorage write on `onResize`. The "sidebar width only changes when the user drags or resizes the window" rule now holds by construction throughout — no imperative correction step that could fight the library's layout pass.

## Consequences

**Positive:**
- Clicking **Explore**, **Stats**, opening a feed, or navigating between articles never changes the sidebar's pixel width. Two layers of regression defence:
  - Unit test `STRUCTURAL INVARIANT: top-level panels are [sidebar, stage] on every desktop route` (in `tests/components/layout/feeds-page-layout.test.tsx`) — fails if anyone introduces a new top-level panel.
  - E2E test `inner handle resizes article-list vs reader, leaves sidebar alone` — fails behaviourally if the topology ever lets inner drags affect the sidebar.
- Future feature areas (Settings, future paid-tier surfaces) drop straight into the stage without changing the sidebar's neighbour relationship. The vocabulary of "the stage" makes that obvious.
- `feeds-page.tsx` desktop branch is more readable: a single `stageContent` variable holds the per-route content, and the JSX shows the stable shell at a glance.

**Negative:**
- Existing users' previously-saved `article-list`/`reader` percentages (stored under the outer group's `feedzero:layout:main` id) are silently reset to the new inner group's defaults (40% / 60%) on next load. A one-time silent reset is acceptable; a migration would cost more than it buys.
- One extra `ResizablePanelGroup` in the React tree on the default route. Negligible; the library is light and the inner group only mounts when needed.

**Rejected alternative (Option 2 — imperative pin):**

Leave the structure as-is and, on every navigation, call `panelRef.resize(savedPixels)` to snap the sidebar back. This was simpler to implement (no JSX restructuring) but violated the rule: the sidebar still gets resized by the library, we just undo it fast. It also fights the library's own layout pass — a recipe for subtle conflicts with future versions. Structural fix wins because it makes the bug impossible, not just unobservable.

## References

- `src/pages/feeds-page.tsx` — the two-tier shell.
- `src/utils/constants.ts` — `PANEL_LAYOUT_ID.MAIN` / `STAGE_INNER`.
- `src/hooks/use-shared-sidebar-size.ts` — kept as a safety net for remount paths.
- `tests/components/layout/feeds-page-layout.test.tsx` — structural invariants.
- `tests/e2e/layout-scroll.spec.ts` — behavioural invariants (outer vs inner handle).
- PR F (2026-05-13) — earlier, incomplete fix that unified the group id but left topology variable.
