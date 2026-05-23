const STORAGE_KEY = "feedzero:favicon-cache";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for successful
const FAILURE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for failures

interface CacheEntry {
  index: number;
  ts: number;
}

/**
 * Persistent favicon cache: origin → { index, ts }.
 *
 * `index` is the favicon strategy that worked (or -1 for "all strategies
 * failed"). Loaded from localStorage on startup, written back on every
 * resolution. Failed entries expire after 24h so they retry on their own;
 * `retryFailedFavicons()` clears them sooner when the user refreshes.
 */
const resolvedCache: Map<string, CacheEntry> = loadCache();

function loadCache(): Map<string, CacheEntry> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Map();
    const entries: [string, number | CacheEntry][] = JSON.parse(stored);
    const now = Date.now();
    const map = new Map<string, CacheEntry>();
    for (const [key, val] of entries) {
      // Migrate legacy format (plain number) to new format
      const entry: CacheEntry =
        typeof val === "number" ? { index: val, ts: now } : val;
      if (isExpired(entry, now)) continue;
      map.set(key, entry);
    }
    return map;
  } catch {
    // localStorage unavailable or corrupt
    return new Map();
  }
}

function isExpired(entry: CacheEntry, now: number = Date.now()): boolean {
  const ttl = entry.index < 0 ? FAILURE_TTL_MS : CACHE_TTL_MS;
  return now - entry.ts > ttl;
}

function persistCache() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(resolvedCache.entries())),
    );
  } catch {
    // localStorage unavailable
  }
}

/**
 * Generation counter bumped whenever the cache changes in a way that should
 * prompt mounted favicons to re-check their cached strategy (currently: a
 * retry that clears failure entries). Components subscribe via
 * `useSyncExternalStore` so a refresh re-attempts favicons that are already
 * on screen, not just ones mounted afterwards. Subscribers must compare the
 * new strategy index against their current one and no-op when unchanged —
 * otherwise a single cleared failure makes every working favicon flash and
 * refetch (issue #117).
 */
let generation = 0;
const listeners = new Set<() => void>();

export function subscribeFaviconCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFaviconGeneration(): number {
  return generation;
}

function notify() {
  generation += 1;
  for (const listener of listeners) listener();
}

/**
 * The favicon strategy index to start from for an origin: the cached
 * working/failed index, or 0 (first strategy) when nothing valid is cached.
 */
export function getFaviconStrategyIndex(origin: string): number {
  const entry = resolvedCache.get(origin);
  if (entry === undefined || isExpired(entry)) return 0;
  return entry.index;
}

export function recordFaviconSuccess(origin: string, index: number) {
  resolvedCache.set(origin, { index, ts: Date.now() });
  persistCache();
}

export function recordFaviconFailure(origin: string) {
  resolvedCache.set(origin, { index: -1, ts: Date.now() });
  persistCache();
}

/**
 * Drop failed entries so they retry on next render. Wired into the
 * refresh-all flow: a transient outage — e.g. a self-hosted server overwhelmed
 * by favicon probes during a bulk OPML import — must not leave favicons broken
 * until the 24h failure TTL expires. See issue #117.
 */
export function retryFailedFavicons() {
  let changed = false;
  for (const [key, entry] of resolvedCache) {
    if (entry.index < 0) {
      resolvedCache.delete(key);
      changed = true;
    }
  }
  if (changed) {
    persistCache();
    notify();
  }
}

/** Clear the favicon cache (used by tests). */
export function clearFaviconCache() {
  resolvedCache.clear();
}

/** Inject a cache entry directly (used by tests). */
export function setFaviconCacheEntry(origin: string, index: number, ts: number) {
  resolvedCache.set(origin, { index, ts });
}
