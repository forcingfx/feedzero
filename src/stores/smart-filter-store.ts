/**
 * Zustand store for user-defined smart filters.
 *
 * Mirrors the folder CRUD pattern in feed-store (load → mutate via
 * encrypted db helper → reload → schedule sync push). Lives in its own
 * file rather than folding into feed-store because (a) the surface is
 * already non-trivial and (b) the editor dialog will subscribe to this
 * store independently of feeds, so the smaller selector slice helps.
 *
 * Defense-in-depth: every mutator gates on the `filters` feature even
 * though the React hook (`useFeatureGate`) gates the UI. A free user
 * who hits a store action via a console or a future shortcut is
 * blocked here too — matches the auto-organize precedent.
 */

import { create } from "zustand";
import {
  getSmartFilters,
  addSmartFilter,
  updateSmartFilter,
  removeSmartFilter,
} from "../core/storage/db.ts";
import { createSmartFilter } from "../core/storage/schema.ts";
import { useSyncStore } from "./sync-store.ts";
import { enforceFeature } from "./enforce-feature.ts";
import type {
  SmartFilter,
  CreateSmartFilterInput,
} from "../types/index.ts";
import type { Result } from "../utils/result.ts";
import { ok, err } from "../utils/result.ts";

interface SmartFilterStore {
  filters: SmartFilter[];
  isLoading: boolean;
  /** True when the editor dialog is open. The dialog component
   *  subscribes to this and renders accordingly. */
  editorOpen: boolean;
  /** The filter being edited, or null when creating a new one. */
  editorTarget: SmartFilter | null;
  loadFilters: () => Promise<void>;
  createFilter: (input: CreateSmartFilterInput) => Promise<Result<SmartFilter>>;
  updateFilter: (filter: SmartFilter) => Promise<Result<SmartFilter>>;
  removeFilter: (id: string) => Promise<void>;
  duplicateFilter: (id: string) => Promise<Result<SmartFilter>>;
  /**
   * Open the editor dialog. Pass an existing filter to edit, or null
   * (default) to create. Gate-locked: a closed gate toasts the
   * upgrade prompt and does NOT open the dialog.
   */
  openEditor: (target?: SmartFilter | null) => void;
  closeEditor: () => void;
}

/**
 * Toast + abort when the feature gate is closed. Delegates to the shared
 * `enforceFeature` (matrix-derived message). Returns the structural err
 * shape directly so each call site can `return rejected` without
 * fighting the discriminated-union narrowing on the wider Result<T>.
 */
function rejectIfGateClosed(): { ok: false; error: string } | null {
  if (enforceFeature("filters")) return null;
  return { ok: false, error: "Smart filters require the Personal tier" };
}

/** Refresh the in-memory snapshot after a mutation. Silent on db error
 *  — the store keeps its previous value, the next reload tries again. */
async function reload(
  set: (partial: Partial<SmartFilterStore>) => void,
): Promise<void> {
  const result = await getSmartFilters();
  if (result.ok) set({ filters: result.value });
}

function schedulePush(): void {
  useSyncStore.getState().scheduleSyncPush();
}

export const useSmartFilterStore = create<SmartFilterStore>((set, get) => ({
  filters: [],
  isLoading: false,
  editorOpen: false,
  editorTarget: null,

  loadFilters: async () => {
    set({ isLoading: true });
    try {
      const result = await getSmartFilters();
      if (result.ok) set({ filters: result.value });
    } finally {
      set({ isLoading: false });
    }
  },

  createFilter: async (input) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return gateError;

    const created = createSmartFilter(input);
    if (!created.ok) return created;

    const added = await addSmartFilter(created.value);
    if (!added.ok) return err(added.error);

    await reload(set);
    schedulePush();
    return ok(created.value);
  },

  updateFilter: async (filter) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return gateError;

    const next: SmartFilter = { ...filter, updatedAt: Date.now() };
    const updated = await updateSmartFilter(next);
    if (!updated.ok) return err(updated.error);

    await reload(set);
    schedulePush();
    return ok(next);
  },

  removeFilter: async (id) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return;

    const removed = await removeSmartFilter(id);
    if (!removed.ok) return;

    await reload(set);
    schedulePush();
  },

  duplicateFilter: async (id) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return gateError;

    const source = get().filters.find((f) => f.id === id);
    if (!source) return err("Smart filter not found");

    return get().createFilter({
      name: `${source.name} (copy)`,
      rule: source.rule,
      icon: source.icon,
      color: source.color,
      sortMode: source.sortMode,
      limit: source.limit,
    });
  },

  openEditor: (target = null) => {
    if (rejectIfGateClosed()) return;
    set({ editorOpen: true, editorTarget: target });
  },

  closeEditor: () => set({ editorOpen: false, editorTarget: null }),
}));
