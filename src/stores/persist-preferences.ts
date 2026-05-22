import type { UserPreferences } from "../types/index.ts";

/**
 * Fire-and-forget writethrough from a consumer store's setter into the
 * preferences-store (which persists the encrypted row + schedules a sync
 * push). Lives in its own module so feed/article/app stores can import it
 * statically without a cycle — preferences-store imports those stores (for
 * hydration propagation), so they cannot import it back directly. The
 * dynamic import defers the dependency to call time.
 *
 * Synchronous by design: the consumer setter already applied the in-memory
 * change for the UI; persistence and sync happen in the background.
 */
export function persistPreferences(patch: Partial<UserPreferences>): void {
  void import("./preferences-store.ts").then(({ usePreferencesStore }) =>
    usePreferencesStore.getState().update(patch),
  );
}
