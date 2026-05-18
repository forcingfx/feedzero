export interface Feed {
  id: string;
  url: string;
  title: string;
  description: string;
  siteUrl: string;
  /** Folder this feed belongs to. Null/undefined = unfiled (top level). */
  folderId?: string;
  /** When true, the reader opens articles from this feed in "Full text" view by default. */
  preferFullText?: boolean;
  createdAt: number;
  updatedAt: number;
  /** Unix epoch ms of the last refresh attempt, success or failure. */
  lastFetchedAt?: number;
  /** Unix epoch ms of the last refresh attempt that returned HTTP 2xx. */
  lastSuccessfulFetchAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  color?: string;
  createdAt: number;
}

export interface Article {
  id: string;
  feedId: string;
  guid: string;
  title: string;
  link: string;
  content: string;
  summary: string;
  author: string;
  publishedAt: number;
  read: boolean;
  createdAt: number;
}

export interface CreateFeedInput {
  url: string;
  title: string;
  description?: string;
  siteUrl?: string;
}

export type FeedSortMode = "name" | "count" | "custom";

/**
 * How the article list is ordered. Persisted to localStorage as a user
 * preference. "newest" preserves the historical default; "unread-first"
 * groups unread before read, then newest-first within each group.
 */
export type ArticleSortMode = "newest" | "oldest" | "unread-first";

export const ARTICLE_SORT_MODES: readonly ArticleSortMode[] = [
  "newest",
  "oldest",
  "unread-first",
] as const;

export interface CreateArticleInput {
  feedId: string;
  title: string;
  link: string;
  guid?: string;
  content?: string;
  summary?: string;
  author?: string;
  publishedAt?: number | null;
}
