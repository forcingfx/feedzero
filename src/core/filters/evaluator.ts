/**
 * Pure evaluator for smart-filter rules.
 *
 * No I/O, no React, no stores. Same inputs → same output, so the
 * filtered article list is a pure function of (filter, articles,
 * feeds, filters, now) and re-derives cheaply on every store change.
 *
 * Defensive: invalid regex, missing feeds/folders, and filterRef
 * cycles all resolve to `false` rather than throwing. A vault sync
 * from an older client must never freeze the article list.
 */

import type {
  Article,
  Feed,
  SmartFilter,
  Condition,
  ConditionGroup,
} from "../../../packages/core/src/types";

export interface EvalContext {
  feedsById: Record<string, Feed>;
  filtersById: Record<string, SmartFilter>;
  /** Cycle guard for filterRef. Caller seeds it; recursion grows it. */
  visiting: Set<string>;
  /** Stable "now" — date conditions read this, not Date.now, so the
   *  result is deterministic within a single render pass. */
  now: number;
}

export interface BuildContextInput {
  feeds: Feed[];
  filters: SmartFilter[];
  now?: number;
}

/**
 * Build an EvalContext from the user's loaded feeds and filters.
 * Callers typically invoke this once per render and reuse it for
 * every article in a list.
 */
export function buildContext(input: BuildContextInput): EvalContext {
  const feedsById: Record<string, Feed> = {};
  for (const f of input.feeds) feedsById[f.id] = f;
  const filtersById: Record<string, SmartFilter> = {};
  for (const f of input.filters) filtersById[f.id] = f;
  return {
    feedsById,
    filtersById,
    visiting: new Set(),
    now: input.now ?? Date.now(),
  };
}

/**
 * Top-level: evaluate a smart filter against a single article.
 * Seeds the cycle guard with this filter's id.
 */
export function evaluateFilter(
  filter: SmartFilter,
  article: Article,
  ctx: EvalContext,
): boolean {
  const visiting = new Set(ctx.visiting);
  visiting.add(filter.id);
  return evaluateGroup(filter.rule, article, { ...ctx, visiting });
}

/**
 * Evaluate a condition group. `all` = AND, `any` = OR. `not: true`
 * inverts the result. Empty `all` is vacuously true; empty `any`
 * is vacuously false — matches the standard zero-element identities.
 */
export function evaluateGroup(
  group: ConditionGroup,
  article: Article,
  ctx: EvalContext,
): boolean {
  const childResults = group.children.map((child) =>
    child.kind === "group"
      ? evaluateGroup(child, article, ctx)
      : evaluateCondition(child, article, ctx),
  );
  const raw =
    group.match === "all"
      ? childResults.every(Boolean)
      : childResults.some(Boolean);
  return group.not ? !raw : raw;
}

/**
 * Evaluate a single condition. Discriminated on `kind` so every
 * branch is type-checked end-to-end; adding a new condition kind
 * forces every operator to be covered.
 */
export function evaluateCondition(
  condition: Condition,
  article: Article,
  ctx: EvalContext,
): boolean {
  switch (condition.kind) {
    case "title":
      return evalTextField(article.title, condition.op, condition.value);
    case "author":
      return evalTextField(article.author, condition.op, condition.value);
    case "content":
      return evalTextField(
        stripHtml(article.content || article.summary || ""),
        condition.op,
        condition.value,
      );
    case "feed":
      return evalMembership(article.feedId, condition.op, condition.value);
    case "folder": {
      const feed = ctx.feedsById[article.feedId];
      if (!feed || !feed.folderId) {
        // Unknown feed (deleted / desync) or unfiled feed: no folder
        // membership. `not-in` over an empty membership is vacuously
        // true; `in` is vacuously false.
        return condition.op === "not-in";
      }
      return evalMembership(feed.folderId, condition.op, condition.value);
    }
    case "publishedAt":
      return evalDate(article.publishedAt, condition, ctx.now);
    case "read":
      return Boolean(article.read) === condition.value;
    case "starred":
      return Boolean(article.starred) === condition.value;
    case "extracted":
      return Boolean(article.extractedContent) === condition.value;
    case "filterRef": {
      const targetId = condition.value;
      if (ctx.visiting.has(targetId)) return false; // cycle
      const target = ctx.filtersById[targetId];
      if (!target) return false;
      return evaluateFilter(target, article, ctx);
    }
  }
}

// --- helpers -----------------------------------------------------------------

type TextOp = "contains" | "not-contains" | "equals" | "matches";

function evalTextField(field: string, op: TextOp, value: string): boolean {
  const haystack = (field ?? "").toLowerCase();
  const needle = value.toLowerCase();
  switch (op) {
    case "contains":
      return haystack.includes(needle);
    case "not-contains":
      return !haystack.includes(needle);
    case "equals":
      return haystack === needle;
    case "matches":
      return safeRegexTest(value, field ?? "");
  }
}

function evalMembership(
  fieldValue: string,
  op: "in" | "not-in",
  list: string[],
): boolean {
  const hit = list.includes(fieldValue);
  return op === "in" ? hit : !hit;
}

function evalDate(
  publishedAt: number,
  condition: Extract<Condition, { kind: "publishedAt" }>,
  now: number,
): boolean {
  const ts = publishedAt ?? 0;
  switch (condition.op) {
    case "in-last-days":
      return now - ts <= (condition.value as number) * 24 * 60 * 60 * 1000;
    case "in-last-hours":
      return now - ts <= (condition.value as number) * 60 * 60 * 1000;
    case "before":
      return ts < (condition.value as number);
    case "after":
      return ts > (condition.value as number);
    case "between": {
      const [lo, hi] = condition.value as [number, number];
      return ts >= lo && ts <= hi;
    }
  }
}

/**
 * Test `pattern` (a user-supplied regex) against `text`,
 * case-insensitive. Returns false on invalid pattern so a malformed
 * value from an older vault doesn't crash the article list.
 */
function safeRegexTest(pattern: string, text: string): boolean {
  try {
    return new RegExp(pattern, "i").test(text);
  } catch {
    return false;
  }
}

/**
 * Cheap HTML stripping for content matching. Not a sanitiser — the
 * goal is to make text conditions match what the user sees, not to
 * make the output safe for rendering. `<a href` should not match
 * "linky" in "<a href='x'>linky</a>".
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
