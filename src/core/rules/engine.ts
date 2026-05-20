/**
 * Pure rules engine: applies a feed's per-feed rules to an article.
 *
 * No I/O, no React, no stores. Same inputs → same output, so callers
 * can run this on a batch of articles during `refreshFeed` ingest
 * (mutating the article shape pre-persist) or during an explicit
 * "Apply to existing" pass without worrying about side effects.
 *
 * Conflict semantics:
 * - Multiple rules whose conditions match all apply, in the order
 *   they appear in the feed's `rules` list (deterministic).
 * - When two rules set conflicting fields (e.g. both
 *   `route-to-folder` with different folderIds), the later rule
 *   wins — the editor warns users on save when this is detectable.
 * - Boolean actions (mute, star, mark-read) are idempotent: applying
 *   them to an already-true field is a no-op.
 *
 * Pure: returns a new Article object; never mutates the input.
 */

import { evaluateGroup } from "../filters/evaluator.ts";
import type { EvalContext } from "../filters/evaluator.ts";
import type { Article, Rule, RuleAction } from "../../types/index.ts";

/**
 * Apply each enabled rule whose condition matches the article. Returns
 * a new Article with all actions composed in rule order.
 */
export function applyRules(
  article: Article,
  rules: Rule[],
  ctx: EvalContext,
): Article {
  let next = article;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (!evaluateGroup(rule.condition, next, ctx)) continue;
    for (const action of rule.actions) {
      next = applyAction(next, action);
    }
  }
  return next;
}

/**
 * Apply one action to one article. Exhaustive switch — TypeScript
 * forces every action kind to be covered, so adding a new kind to
 * `RuleAction` is a compile-time error until the engine handles it.
 */
function applyAction(article: Article, action: RuleAction): Article {
  switch (action.kind) {
    case "mark-read":
      return article.read ? article : { ...article, read: true };
    case "star":
      return article.starred
        ? article
        : { ...article, starred: true, starredAt: Date.now() };
    case "mute":
      return article.muted ? article : { ...article, muted: true };
    case "route-to-folder":
      return article.folderId === action.folderId
        ? article
        : { ...article, folderId: action.folderId };
  }
}
