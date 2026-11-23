import type { Feed } from "@feedzero/core/types";
import type { VaultData } from "./types";

/**
 * Feed fields a routine refresh rewrites without the user or the feed
 * changing anything. They stay in the vault, but a change to them alone
 * is not worth a full upload: each device keeps its own values current.
 */
const REFRESH_BOOKKEEPING: readonly (keyof Feed)[] = [
  "updatedAt",
  "lastFetchedAt",
  "lastSuccessfulFetchAt",
  "lastError",
  "consecutive304Count",
  "etag",
  "lastModified",
];

function withoutBookkeeping(feed: Feed): Partial<Feed> {
  const kept: Partial<Feed> = { ...feed };
  for (const field of REFRESH_BOOKKEEPING) delete kept[field];
  return kept;
}

function byId<T extends { id: string }>(items: readonly T[] = []): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** JSON with sorted object keys, so equal data always serializes equally. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return item;
    }
    const source = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, source[key]]),
    );
  });
}

/**
 * A hash of everything in a vault worth syncing. Two vaults with the same
 * fingerprint differ only in export time and refresh bookkeeping.
 *
 * Holds a hash of decrypted content, so it stays in memory and is never
 * persisted or sent to the server.
 */
export async function fingerprintVault(vault: VaultData): Promise<string> {
  const { exportedAt: _exportedAt, ...content } = vault;
  const canonical = canonicalJson({
    ...content,
    feeds: byId(vault.feeds).map(withoutBookkeeping),
    articles: byId(vault.articles),
    folders: byId(vault.folders),
    smartFilters: byId(vault.smartFilters),
    briefings: byId(vault.briefings),
  });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
