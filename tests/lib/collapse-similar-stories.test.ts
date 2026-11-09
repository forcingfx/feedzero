import { describe, it, expect } from "vitest";
import {
  collapseSimilarStories,
  SIMILARITY_THRESHOLD,
} from "@/lib/collapse-similar-stories.ts";
import type { Article } from "@feedzero/core/types";

let clock = 1_000_000;
function article(id: string, title: string, feedId = "f1"): Article {
  clock -= 60_000; // each later article is older: input is publishedAt-desc
  return {
    id,
    feedId,
    guid: id,
    title,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: clock,
    read: false,
    createdAt: clock,
  };
}

/**
 * Issue #343: several feeds in one folder run the same story with small
 * title changes. Fold them under the newest copy (owner's call 2a).
 */
describe("collapseSimilarStories", () => {
  const fed = article("a", "Fed raises interest rates by quarter point", "f1");
  const fedShort = article("b", "Fed raises rates a quarter point", "f2");
  const fedLong = article("c", "Federal Reserve raises interest rates by a quarter point", "f3");
  const bakery = article("d", "Local bakery wins national award", "f1");

  it("keeps unrelated stories apart and preserves input order", () => {
    const out = collapseSimilarStories([fed, bakery], "normal");
    expect(out.map((s) => s.lead.id)).toEqual(["a", "d"]);
    expect(out.every((s) => s.duplicates.length === 0)).toBe(true);
  });

  it("folds near-identical titles under the newest copy at Normal", () => {
    const out = collapseSimilarStories([fed, fedShort, fedLong, bakery], "normal");
    expect(out.map((s) => s.lead.id)).toEqual(["a", "d"]);
    expect(out[0]!.duplicates.map((d) => d.id)).toEqual(["b", "c"]);
  });

  it("Strict keeps the loosely matching rewrite separate", () => {
    const out = collapseSimilarStories([fed, fedShort, fedLong], "strict");
    expect(out.map((s) => s.lead.id)).toEqual(["a", "c"]);
    expect(out[0]!.duplicates.map((d) => d.id)).toEqual(["b"]);
  });

  it("Loose folds a story that shares only about half its words", () => {
    const recall = article("e", "Tesla recalls two million cars over autopilot flaw");
    const recallB = article("f", "Tesla recall hits two million vehicles", "f2");
    expect(collapseSimilarStories([recall, recallB], "normal")).toHaveLength(2);
    expect(collapseSimilarStories([recall, recallB], "loose")).toHaveLength(1);
  });

  it("never folds titles that tokenize to nothing", () => {
    const blankA = article("g", "...", "f1");
    const blankB = article("h", "!!!", "f2");
    expect(collapseSimilarStories([blankA, blankB], "loose")).toHaveLength(2);
  });

  it("thresholds are ordered loose < normal < strict", () => {
    expect(SIMILARITY_THRESHOLD.loose).toBeLessThan(SIMILARITY_THRESHOLD.normal);
    expect(SIMILARITY_THRESHOLD.normal).toBeLessThan(SIMILARITY_THRESHOLD.strict);
  });
});
