import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import { SCHEMA_VERSION } from "../../../packages/core/src/utils/constants";
import type {
  Feed,
  Article,
  SmartFilter,
  Rule,
  RuleAction,
  CreateFeedInput,
  CreateArticleInput,
  CreateSmartFilterInput,
  CreateRuleInput,
} from "../../../packages/core/src/types";

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

/**
 * Create a new per-feed rule with sensible defaults. Rules without
 * actions are rejected — that would just be a smart filter, and we
 * keep the two concepts separate so a user editing a saved view
 * doesn't accidentally mutate state.
 */
export function createRule({
  name,
  condition,
  actions,
  enabled = true,
}: CreateRuleInput): Result<Rule> {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return err("Rule requires a name");
  if (!condition) return err("Rule requires a condition");
  if (!Array.isArray(actions) || actions.length === 0) {
    return err("Rule requires at least one action");
  }
  const now = Date.now();
  return ok({
    id: crypto.randomUUID(),
    name: trimmed,
    enabled,
    condition,
    actions,
    createdAt: now,
    updatedAt: now,
  });
}

function isValidAction(action: unknown): action is RuleAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  switch (a.kind) {
    case "mark-read":
    case "star":
    case "mute":
      return true;
    case "route-to-folder":
      return typeof a.folderId === "string" && a.folderId.length > 0;
    default:
      return false;
  }
}

/**
 * Validate a rule object. Tolerant of older shapes only where defaults
 * make sense (missing `enabled` defaults to true in callers); rejects
 * anything that would crash the engine at runtime — e.g. a
 * `route-to-folder` action with no `folderId` from a malformed vault.
 */
export function validateRule(rule: unknown): Result<Rule> {
  if (!rule || typeof rule !== "object") return err("Rule must be an object");
  const r = rule as Record<string, unknown>;
  if (typeof r.id !== "string" || !r.id) return err("Rule missing id");
  if (typeof r.name !== "string" || !r.name) return err("Rule missing name");
  if (!r.condition || typeof r.condition !== "object") {
    return err("Rule missing condition");
  }
  if (!Array.isArray(r.actions) || r.actions.length === 0) {
    return err("Rule must have at least one action");
  }
  if (!r.actions.every(isValidAction)) {
    return err("Rule contains an invalid action");
  }
  return ok(rule as Rule);
}
