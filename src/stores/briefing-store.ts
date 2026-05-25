/**
 * Zustand store for Signal Briefings — saved prompts + cached reports.
 *
 * Mirrors smart-filter-store's CRUD shape: load → mutate via the
 * encrypted db helper → reload → schedule sync push. Per-briefing
 * status lives in a Map so the UI can show one briefing as "loading"
 * while another sits "ready".
 *
 * Defense-in-depth: every gated action (create, refresh) re-checks
 * `enforceFeature("signal-briefings")` even though the page-level
 * `useFeatureGate` already gates the UI. A user whose paid tier
 * lapses with a tab open is blocked here too. The `create` action
 * additionally enforces the BRIEFINGS_LIMIT cap from quotas.ts.
 *
 * The store doesn't load articles itself — it accepts them from the
 * caller (the briefing page or the auto-refresh hook), which already
 * has them in `article-store`. Keeps the store focused on briefings,
 * not on cross-store article aggregation.
 */

import { create } from "zustand";
import {
  getBriefings,
  addBriefing,
  updateBriefing,
  removeBriefing,
} from "../core/storage/db.ts";
import { createBriefing } from "../core/storage/schema.ts";
import { getAnthropicKey } from "../core/storage/secrets.ts";
import { refreshBriefingFlow } from "../core/briefings/briefing-service.ts";
import type { RefreshBriefingResult } from "../core/briefings/briefing-service.ts";
import {
  DEFAULT_BRIEFING_MODEL,
  type BriefingModelId,
} from "../core/briefings/models.ts";
import { matchArticles } from "../core/briefings/prompt-matcher.ts";
import { useSyncStore } from "./sync-store.ts";
import { useLicenseStore } from "./license-store.ts";
import { enforceFeature, isFeatureEnabled } from "./enforce-feature.ts";
import { checkBriefingQuota } from "../core/features/quotas.ts";
import { isPaidTierActive } from "../core/features/paid-tier-active.ts";
import { isSelfHosted } from "../core/features/self-hosted.ts";
import type {
  Article,
  Briefing,
  CreateBriefingInput,
} from "@feedzero/core/types";
import type { Result } from "@feedzero/core/utils/result";
import { ok, err } from "@feedzero/core/utils/result";

/**
 * Per-briefing UI state machine. `idle` = never refreshed in this
 * session (lastReport may still be populated from a prior run). The
 * other states reflect the most recent refresh outcome.
 */
export type BriefingStatus =
  | "idle"
  | "loading"
  | "ready"
  | "error"
  | "not-enough-evidence"
  | "no-api-key"
  | "no-articles";

export interface RefreshOptions {
  modelId?: BriefingModelId;
  articles: Article[];
  bridgesEnabled?: boolean;
  signal?: AbortSignal;
}

interface BriefingStore {
  briefings: Briefing[];
  isLoading: boolean;
  /** Per-briefing-id status. Missing entry = "idle". */
  statusById: Map<string, BriefingStatus>;
  /** Per-briefing-id error string, populated when status is "error". */
  errorById: Map<string, string>;
  /** Per-briefing-id signal score for "not-enough-evidence" splashes. */
  pendingScoreById: Map<string, number>;
  /**
   * Per-briefing-id wall-clock for when the current "loading" refresh
   * started. Lives in the store, not in the page component, so the
   * elapsed-time skeleton survives nav away + back (which unmounts the
   * page and would otherwise reset a local-state timer).
   */
  loadingStartedAtById: Map<string, number>;
  loadBriefings: () => Promise<void>;
  createBriefing: (
    input: CreateBriefingInput,
  ) => Promise<Result<Briefing>>;
  renameBriefing: (id: string, name: string) => Promise<Result<Briefing>>;
  removeBriefing: (id: string) => Promise<void>;
  refreshBriefing: (
    id: string,
    options: RefreshOptions,
  ) => Promise<RefreshBriefingResult>;
  /**
   * Walk every saved briefing and update `staleArticleCount` based on
   * how many NEW articles in `allArticles` match the prompt. Called by
   * the auto-refresh hook after every refreshAll() cycle.
   */
  refreshStaleCounts: (allArticles: Article[]) => Promise<void>;
}

function rejectIfGateClosed(): { ok: false; error: string } | null {
  if (enforceFeature("signal-briefings")) return null;
  return { ok: false, error: "Signal Briefings is a paid feature" };
}

async function reload(
  set: (partial: Partial<BriefingStore>) => void,
): Promise<void> {
  const result = await getBriefings();
  if (result.ok) set({ briefings: result.value });
}

function schedulePush(): void {
  useSyncStore.getState().scheduleSyncPush();
}

function setStatus(
  set: (updater: (state: BriefingStore) => Partial<BriefingStore>) => void,
  id: string,
  status: BriefingStatus,
  errorMsg?: string,
  pendingScore?: number,
): void {
  set((state) => {
    const statusById = new Map(state.statusById);
    statusById.set(id, status);
    const errorById = new Map(state.errorById);
    if (errorMsg !== undefined) {
      errorById.set(id, errorMsg);
    } else {
      errorById.delete(id);
    }
    const pendingScoreById = new Map(state.pendingScoreById);
    if (pendingScore !== undefined) {
      pendingScoreById.set(id, pendingScore);
    } else {
      pendingScoreById.delete(id);
    }
    // Stamp the run start on the loading transition; clear it on every
    // other terminal status so the next loading run gets a fresh stamp.
    const loadingStartedAtById = new Map(state.loadingStartedAtById);
    if (status === "loading") {
      loadingStartedAtById.set(id, Date.now());
    } else {
      loadingStartedAtById.delete(id);
    }
    return { statusById, errorById, pendingScoreById, loadingStartedAtById };
  });
}

export const useBriefingStore = create<BriefingStore>((set, get) => ({
  briefings: [],
  isLoading: false,
  statusById: new Map(),
  errorById: new Map(),
  pendingScoreById: new Map(),
  loadingStartedAtById: new Map(),

  loadBriefings: async () => {
    set({ isLoading: true });
    try {
      const result = await getBriefings();
      if (result.ok) set({ briefings: result.value });
    } finally {
      set({ isLoading: false });
    }
  },

  createBriefing: async (input) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return gateError;

    const tier = useLicenseStore.getState().tier;
    const quota = checkBriefingQuota({
      currentCount: get().briefings.length,
      tier,
      isSelfHosted: isSelfHosted(),
      paidTierActive: isPaidTierActive(),
    });
    if (!quota.ok) {
      return err(
        `You've reached the limit of ${quota.limit} briefings. Delete one to create another, or self-host.`,
      );
    }

    const created = createBriefing(input);
    if (!created.ok) return created;

    const added = await addBriefing(created.value);
    if (!added.ok) return err(added.error);

    await reload(set);
    schedulePush();
    return ok(created.value);
  },

  renameBriefing: async (id, name) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return gateError;
    const trimmed = name.trim();
    if (!trimmed) return err("Briefing name cannot be empty");

    const existing = get().briefings.find((b) => b.id === id);
    if (!existing) return err("Briefing not found");

    const next: Briefing = { ...existing, name: trimmed };
    const updated = await updateBriefing(next);
    if (!updated.ok) return err(updated.error);

    await reload(set);
    schedulePush();
    return ok(next);
  },

  removeBriefing: async (id) => {
    const gateError = rejectIfGateClosed();
    if (gateError) return;

    const removed = await removeBriefing(id);
    if (!removed.ok) return;

    set((state) => {
      const statusById = new Map(state.statusById);
      statusById.delete(id);
      const errorById = new Map(state.errorById);
      errorById.delete(id);
      const pendingScoreById = new Map(state.pendingScoreById);
      pendingScoreById.delete(id);
      const loadingStartedAtById = new Map(state.loadingStartedAtById);
      loadingStartedAtById.delete(id);
      return { statusById, errorById, pendingScoreById, loadingStartedAtById };
    });

    await reload(set);
    schedulePush();
  },

  refreshBriefing: async (id, options) => {
    const gateError = rejectIfGateClosed();
    if (gateError) {
      setStatus(set, id, "error", gateError.error);
      return { ok: false, reason: "error", error: gateError.error };
    }

    const briefing = get().briefings.find((b) => b.id === id);
    if (!briefing) {
      const error = "Briefing not found";
      setStatus(set, id, "error", error);
      return { ok: false, reason: "error", error };
    }

    setStatus(set, id, "loading");

    const keyResult = await getAnthropicKey();
    const apiKey = keyResult.ok ? keyResult.value : null;

    const result = await refreshBriefingFlow({
      briefing,
      articles: options.articles,
      apiKey,
      modelId: options.modelId ?? DEFAULT_BRIEFING_MODEL,
      bridgesEnabled: options.bridgesEnabled,
      signal: options.signal,
    });

    if (!result.ok) {
      const status: BriefingStatus =
        result.reason === "no-api-key"
          ? "no-api-key"
          : result.reason === "no-articles"
            ? "no-articles"
            : result.reason === "not-enough-evidence"
              ? "not-enough-evidence"
              : "error";
      setStatus(set, id, status, result.error, result.signalScore);
      return result;
    }

    const persisted = await updateBriefing(result.briefing);
    if (!persisted.ok) {
      const error = `Briefing generated but failed to save: ${persisted.error}`;
      setStatus(set, id, "error", error);
      return { ok: false, reason: "error", error };
    }

    await reload(set);
    schedulePush();
    setStatus(set, id, "ready");
    return result;
  },

  refreshStaleCounts: async (allArticles) => {
    // Skip entirely when the feature is gate-locked — no need to walk
    // the corpus for a user who can't see briefings anyway.
    if (!isFeatureEnabled("signal-briefings")) return;

    const briefings = get().briefings;
    if (briefings.length === 0) return;

    let touched = false;
    const next: Briefing[] = [];
    for (const briefing of briefings) {
      // Articles ingested AFTER the last successful run count as "new".
      const since = briefing.lastRunAt ?? briefing.createdAt;
      const fresh = allArticles.filter((a) => a.createdAt > since);
      const matches = matchArticles(briefing.prompt, fresh);
      const staleArticleCount = matches.length;
      if (staleArticleCount !== briefing.staleArticleCount) {
        const updated = { ...briefing, staleArticleCount };
        next.push(updated);
        await updateBriefing(updated);
        touched = true;
      } else {
        next.push(briefing);
      }
    }
    if (touched) {
      set({ briefings: next });
      schedulePush();
    }
  },
}));
