import { ok, err } from "../../utils/result.ts";
import type { Result } from "../../utils/result.ts";
import { SCHEMA_VERSION } from "../../utils/constants.ts";
import type {
  Feed,
  Article,
  SmartFilter,
  CreateFeedInput,
  CreateArticleInput,
  CreateSmartFilterInput,
} from "../../types/index.ts";

export { SCHEMA_VERSION };

/**
 * Create a new feed object with defaults.
 */
export function createFeed({ url, title, description = "", siteUrl = "" }: CreateFeedInput): Result<Feed> {
  if (!url || !title) return err("Feed requires url and title");
  return ok({
    id: crypto.randomUUID(),
    url,
    title,
    description,
    siteUrl,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/**
 * Create a new article object with defaults.
 */
export function createArticle({
  feedId,
  title,
  link,
  guid = "",
  content = "",
  summary = "",
  author = "",
  publishedAt = null,
}: CreateArticleInput): Result<Article> {
  if (!feedId || !title || !link)
    return err("Article requires feedId, title, and link");
  return ok({
    id: crypto.randomUUID(),
    feedId,
    guid: guid || link,
    title,
    link,
    content,
    summary,
    author,
    publishedAt: publishedAt ?? Date.now(),
    read: false,
    createdAt: Date.now(),
  });
}

/**
 * Validate a feed object has required fields.
 */
export function validateFeed(feed: unknown): Result<Feed> {
  if (!feed || typeof feed !== "object") return err("Feed must be an object");
  const f = feed as Record<string, unknown>;
  if (!f.id || !f.url || !f.title)
    return err("Feed missing required fields");
  return ok(feed as Feed);
}

/**
 * Validate an article object has required fields.
 */
export function validateArticle(article: unknown): Result<Article> {
  if (!article || typeof article !== "object")
    return err("Article must be an object");
  const a = article as Record<string, unknown>;
  if (!a.id || !a.feedId || !a.title || !a.link) {
    return err("Article missing required fields");
  }
  return ok(article as Article);
}

/**
 * Create a new smart-filter object with defaults.
 * Whitespace-only names are rejected so the sidebar never renders an
 * invisible row.
 */
export function createSmartFilter({
  name,
  rule,
  icon,
  color,
  sortMode,
  limit,
}: CreateSmartFilterInput): Result<SmartFilter> {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return err("Smart filter requires a name");
  if (!rule) return err("Smart filter requires a rule");
  const now = Date.now();
  return ok({
    id: crypto.randomUUID(),
    name: trimmed,
    icon,
    color,
    sortMode,
    limit,
    rule,
    createdAt: now,
    updatedAt: now,
  });
}
