import type { Result } from "../../../packages/core/src/utils/result";

/** A feed in the global catalog. Contains only public/aggregate data — no user identity. */
export interface CatalogFeed {
  /** Normalized feed URL (primary key). */
  url: string;
  /** Feed title from the feed's own metadata. */
  title: string | null;
  /** Feed description. */
  description: string | null;
  /** Site URL (homepage of the feed source). */
  siteUrl: string | null;
  /** Current health status. */
  status: "active" | "dead" | "error";
  /** Total anonymous proxy request count (aggregate, not per-user). */
  requestCount: number;
  /** When any user last fetched this feed via the proxy. */
  lastRequestedAt: string;
  /** When the server last crawled this feed. */
  lastCrawledAt: string | null;
  /** Consecutive error count during crawling. */
  errorCount: number;
  /** Most recent error message. */
  lastError: string | null;
  /** When the catalog entry was first created. */
  createdAt: string;
}

/** Storage adapter for the server-side feed catalog. */
export interface CatalogStorageAdapter {
  /** Record a proxy request for this feed URL. Creates entry if new, increments count if existing. */
  upsert(url: string): Promise<Result<true>>;
  /** Get catalog entry for a feed URL. Returns null if not in catalog. */
  get(url: string): Promise<Result<CatalogFeed | null>>;
  /** Get the most-requested feeds, sorted by requestCount descending. */
  popular(limit: number): Promise<Result<CatalogFeed[]>>;
  /** Update metadata fields on an existing catalog entry. */
  updateMetadata(url: string, metadata: Partial<Pick<CatalogFeed, "title" | "description" | "siteUrl" | "status" | "lastCrawledAt" | "errorCount" | "lastError">>): Promise<Result<true>>;
  /** Total number of feeds in the catalog. */
  count(): Promise<Result<number>>;
}
