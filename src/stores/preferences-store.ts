import { create } from "zustand";
import { getPreferences, putPreferences } from "../core/storage/db.ts";
import { LOCAL_STORAGE } from "../utils/constants.ts";
import { DEFAULT_PREFERENCES } from "../types/index.ts";
import type { UserPreferences, FeedSortMode, ArticleSortMode } from "../types/index.ts";
import { useFeedStore } from "./feed-store.ts";
import { useArticleStore } from "./article-store.ts";
import { useAppStore } from "./app-store.ts";
import { useSyncStore } from "./sync-store.ts";

/**
 * Single source of truth for synced user preferences. Replaces the loose,
 * unencrypted localStorage keys that previously stranded these settings on
 * one device. The canonical persisted copy is the encrypted `preferences`
 * Dexie row; this store mirrors it in memory and writes through on every
 * change (debounced sync push included).
 *
 * Consumer stores (feed/article/app) keep their own in-memory field for
 * synchronous reads by components; their setters update that field AND call
 * `update()` here. `hydrate()` runs once after the DB is open and pushes the
 * persisted values back into those stores.
 */
interface PreferencesStore {
  preferences: UserPreferences;
  hydrated: boolean;
  /**
   * Load preferences from the DB (or migrate legacy localStorage keys on
   * first run), then propagate them into the consumer stores. Idempotent —
   * safe to call from multiple boot paths.
   */
  hydrate: () => Promise<void>;
  /**
   * Re-read the DB row and propagate it, bypassing the hydrate guard. Used
   * after a flow rewrites the preferences row underneath us — a cloud
   * restore (forceResync / switchToExistingCloud) — so the UI reflects the
   * imported preferences without a reload.
   */
  reload: () => Promise<void>;
  /** Merge a patch, persist the encrypted row, and schedule a sync push. */
  update: (patch: Partial<UserPreferences>) => Promise<void>;
}

/**
 * Build a preferences object from the legacy localStorage keys, used once on
 * the first boot after upgrade (before the DB row exists). Missing / invalid
 * values fall back to DEFAULT_PREFERENCES.
 */
function readLegacyPreferences(): UserPreferences {
  return {
    feedSortMode: readEnum<FeedSortMode>(
      LOCAL_STORAGE.FEED_SORT_MODE,
      ["name", "count", "custom"],
      DEFAULT_PREFERENCES.feedSortMode,
    ),
    feedCustomOrder: readJsonArray(LOCAL_STORAGE.FEED_CUSTOM_ORDER),
    folderCustomOrder: readJsonArray(LOCAL_STORAGE.FOLDER_CUSTOM_ORDER),
    articleSortMode: readEnum<ArticleSortMode>(
      LOCAL_STORAGE.ARTICLE_SORT_MODE,
      ["newest", "oldest", "unread-first"],
      DEFAULT_PREFERENCES.articleSortMode,
    ),
    // Default-on: only an explicit "false" disables grouping.
    groupArticleFloods:
      readRaw(LOCAL_STORAGE.GROUP_ARTICLE_FLOODS) !== "false",
  };
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readEnum<T extends string>(
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = readRaw(key);
  return raw && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function readJsonArray(key: string): string[] {
  const raw = readRaw(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

const LEGACY_PREFERENCE_KEYS = [
  LOCAL_STORAGE.FEED_SORT_MODE,
  LOCAL_STORAGE.FEED_CUSTOM_ORDER,
  LOCAL_STORAGE.FOLDER_CUSTOM_ORDER,
  LOCAL_STORAGE.ARTICLE_SORT_MODE,
  LOCAL_STORAGE.GROUP_ARTICLE_FLOODS,
];

function clearLegacyPreferenceKeys(): void {
  try {
    for (const key of LEGACY_PREFERENCE_KEYS) localStorage.removeItem(key);
  } catch {
    /* localStorage unavailable — nothing to clear */
  }
}

/**
 * Push hydrated preferences into the consumer stores' in-memory fields via
 * setState (NOT their writethrough setters — that would loop back here and
 * trigger a spurious sync push).
 *
 * Stores are statically imported. An earlier version used dynamic
 * `import("./app-store.ts")` here ("Lazy imports avoid a boot-time
 * cycle") — but Rollup bundles app-store into the entry chunk
 * (`index-*.js`), and the entry chunk doesn't re-export source-name
 * properties (only minified aliases used by static importers). The
 * dynamic-import promise resolved fine, the destructure
 * `{ useAppStore } = aps` came back undefined, and the next setState
 * blew up boot with `Cannot read properties of undefined (reading
 * 'setState')` — the user saw "Failed to initialize: undefined is not
 * an object". Static imports go through the proper re-export pipeline
 * in every chunk topology. The cycle the original comment worried
 * about is harmless because the stores are only touched at runtime,
 * never during module evaluation.
 */
function propagateToStores(prefs: UserPreferences): void {
  useFeedStore.setState({
    feedSortMode: prefs.feedSortMode,
    feedCustomOrder: prefs.feedCustomOrder,
    folderCustomOrder: prefs.folderCustomOrder,
  });
  useArticleStore.setState({ articleSortMode: prefs.articleSortMode });
  useAppStore.setState({ groupArticleFloods: prefs.groupArticleFloods });
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  preferences: { ...DEFAULT_PREFERENCES },
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;

    const result = await getPreferences();
    let prefs: UserPreferences;
    if (result.ok && result.value) {
      prefs = result.value;
    } else {
      // No row yet — adopt any legacy localStorage values (defaults if
      // none) and persist them as the first DB row.
      prefs = readLegacyPreferences();
      await putPreferences(prefs);
    }

    // Legacy keys are now superseded by the encrypted row on every path.
    clearLegacyPreferenceKeys();

    set({ preferences: prefs, hydrated: true });
    propagateToStores(prefs);
  },

  reload: async () => {
    const result = await getPreferences();
    const prefs = result.ok && result.value ? result.value : { ...DEFAULT_PREFERENCES };
    set({ preferences: prefs, hydrated: true });
    propagateToStores(prefs);
  },

  update: async (patch) => {
    const next = { ...get().preferences, ...patch };
    set({ preferences: next });
    await putPreferences(next);
    useSyncStore.getState().scheduleSyncPush();
  },
}));
