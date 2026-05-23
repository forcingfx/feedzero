/**
 * Validate a smart-filter rule shape at edit time, before it can
 * reach storage. The evaluator is defensive against bad values (a
 * vault sync could deliver them anyway from an older client), but
 * we still want the editor to surface "this regex is malformed" the
 * moment the user types it rather than silently making the filter
 * match nothing.
 */

import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import type {
  Condition,
  ConditionGroup,
  SmartFilter,
} from "../../../packages/core/src/types";

export function validateFilter(filter: SmartFilter): Result<void> {
  if (!filter.name || !filter.name.trim()) {
    return err("Filter name is required");
  }
  return validateGroup(filter.rule);
}

export function validateGroup(group: ConditionGroup): Result<void> {
  for (const child of group.children) {
    const result =
      child.kind === "group"
        ? validateGroup(child)
        : validateCondition(child);
    if (!result.ok) return result;
  }
  return ok(undefined);
}

export function validateCondition(condition: Condition): Result<void> {
  switch (condition.kind) {
    case "title":
    case "author":
    case "content":
      if (!condition.value || !condition.value.trim()) {
        return err(`${condition.kind} ${condition.op} requires a value`);
      }
      if (condition.op === "matches") {
        try {
          new RegExp(condition.value, "i");
        } catch {
          return err(`Invalid regex for ${condition.kind}`);
        }
      }
      return ok(undefined);

    case "feed":
    case "folder":
      if (!Array.isArray(condition.value) || condition.value.length === 0) {
        return err(`${condition.kind} ${condition.op} requires at least one id`);
      }
      return ok(undefined);

    case "publishedAt":
      if (condition.op === "in-last-days" || condition.op === "in-last-hours") {
        if (typeof condition.value !== "number" || condition.value <= 0) {
          return err(`${condition.op} requires a positive number`);
        }
        return ok(undefined);
      }
      if (condition.op === "between") {
        if (
          !Array.isArray(condition.value) ||
          condition.value.length !== 2 ||
          condition.value[0] > condition.value[1]
        ) {
          return err("between requires [lo, hi] with lo <= hi");
        }
        return ok(undefined);
      }
      if (condition.op === "before" || condition.op === "after") {
        if (typeof condition.value !== "number") {
          return err(`${condition.op} requires a timestamp`);
        }
        return ok(undefined);
      }
      return ok(undefined);

    case "read":
    case "starred":
    case "extracted":
      // Cast to unknown so the runtime guard isn't elided as
      // unreachable by TS narrowing — a vault from an older client
      // could deliver a non-boolean here.
      if (typeof (condition.value as unknown) !== "boolean") {
        return err(`${condition.kind} requires a boolean`);
      }
      return ok(undefined);

    case "filterRef":
      if (!condition.value) {
        return err("filterRef requires a filter id");
      }
      return ok(undefined);
  }
}
