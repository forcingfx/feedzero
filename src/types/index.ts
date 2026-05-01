export interface Feed {
  id: string;
  url: string;
  title: string;
  description: string;
  siteUrl: string;
  /** Folder this feed belongs to. Null/undefined = unfiled (top level). */
  folderId?: string;
  createdAt: number;
  updatedAt: number;
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
