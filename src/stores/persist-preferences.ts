import type { UserPreferences } from "@feedzero/core/types";
import { usePreferencesStore } from "./preferences-store.ts";

/**
 * Fire-and-forget writethrough from a consumer store's setter into the
 * preferences-store (which persists the encrypted row + schedules a sync
 * push). Lives in its own module so callers don't have to import the
 * heavier preferences-store directly at every call site.
 *
 * The preferences-store imports feed/article/app stores (for hydration
 * propagation), so there is a runtime cycle here:
 *   feed-store → persist-preferences → preferences-store → feed-store
 * The cycle is safe because each side only touches the other's exports
 * inside function bodies (runtime), never during module evaluation. The
 * earlier `import("./preferences-store.ts")` dynamic-then-destructure
 * pattern looked like a cycle-breaker but in practice triggered
 * Rollup's INEFFECTIVE_DYNAMIC_IMPORT warning and, in the
 * 2026-05-23 prod-bundle boot crash, the same destructure-of-
 * undefined failure mode in the sibling preferences-store.ts. Static
 * is correct here. Cf. docs/incidents/2026-05-23-prod-bundle-boot-crash.md.
 *
 * Synchronous by design: the consumer setter already applied the
 * in-memory change for the UI; persistence and sync happen in the
 * background via the void'd promise from `update()`.
 */
export function persistPreferences(patch: Partial<UserPreferences>): void {
  void usePreferencesStore.getState().update(patch);
}
