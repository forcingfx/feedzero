import { describe, it, expect } from "vitest";
import {
  evaluateFilter,
  evaluateGroup,
  evaluateCondition,
  buildContext,
  type EvalContext,
} from "../../../src/core/filters/evaluator.ts";
import type {
  Article,
  Feed,
  SmartFilter,
  Condition,
  ConditionGroup,
} from "@feedzero/core/types";

// --- fixtures ------------------------------------------------------------

const NOW = 1_700_000_000_000;
const ONE_DAY = 24 * 60 * 60 * 1000;

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "feed-1",
    url: "https://example.com/feed.xml",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a1",
    feedId: "feed-1",
    guid: "guid-1",
    title: "Hello world",
    link: "https://example.com/a/1",
    content: "<p>article content goes here</p>",
    summary: "summary text",
    author: "Alice",
    publishedAt: NOW - ONE_DAY,
    read: false,
    createdAt: NOW - ONE_DAY,
    ...overrides,
  };
}

function filter(overrides: Partial<SmartFilter> = {}): SmartFilter {
  return {
    id: "filter-1",
    name: "test",
    rule: { kind: "group", match: "all", children: [] },
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function ctxWith(
  feeds: Feed[] = [feed()],
  filters: SmartFilter[] = [],
): EvalContext {
  return buildContext({ feeds, filters, now: NOW });
}

// --- condition: title --------------------------------------------------------

describe("evaluateCondition — title", () => {
  it("contains (case-insensitive) matches partial substrings", () => {
    const a = article({ title: "Hello World" });
    expect(
      evaluateCondition(
        { kind: "title", op: "contains", value: "WORLD" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "title", op: "contains", value: "missing" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("not-contains is the inverse of contains", () => {
    const a = article({ title: "Hello World" });
    expect(
      evaluateCondition(
        { kind: "title", op: "not-contains", value: "world" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        { kind: "title", op: "not-contains", value: "absent" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("equals is case-insensitive full match", () => {
    const a = article({ title: "Hello" });
    expect(
      evaluateCondition(
        { kind: "title", op: "equals", value: "hello" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "title", op: "equals", value: "hello " },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("matches runs case-insensitive regex against the value", () => {
    const a = article({ title: "GPT-5 launches today" });
    expect(
      evaluateCondition(
        { kind: "title", op: "matches", value: "^gpt-\\d+" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "title", op: "matches", value: "^Apple" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("matches with an invalid regex evaluates to false rather than throwing", () => {
    // Validation rejects bad regex at edit time but the evaluator must
    // be defensive — a vault sync could deliver a malformed value from
    // an older client and the user should see "no match", not a crash.
    const a = article({ title: "Anything" });
    expect(
      evaluateCondition(
        { kind: "title", op: "matches", value: "[unterminated" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });
});

// --- condition: author / content ---------------------------------------------

describe("evaluateCondition — author + content", () => {
  it("author equals (case-insensitive)", () => {
    const a = article({ author: "Alice" });
    expect(
      evaluateCondition(
        { kind: "author", op: "equals", value: "alice" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("content contains strips HTML before matching", () => {
    const a = article({
      content: "<p>Look at this <a href='x'>linky</a> text.</p>",
    });
    expect(
      evaluateCondition(
        { kind: "content", op: "contains", value: "linky text" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    // Markup tokens must not produce false positives
    expect(
      evaluateCondition(
        { kind: "content", op: "contains", value: "<a href" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("content matches uses regex over the stripped text", () => {
    const a = article({ content: "<b>Year 2026</b> review" });
    expect(
      evaluateCondition(
        { kind: "content", op: "matches", value: "\\b20\\d\\d\\b" },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });
});

// --- condition: feed / folder ------------------------------------------------

describe("evaluateCondition — feed + folder", () => {
  it("feed in [...] matches the article's feedId", () => {
    const a = article({ feedId: "feed-1" });
    expect(
      evaluateCondition(
        { kind: "feed", op: "in", value: ["feed-1", "feed-2"] },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "feed", op: "in", value: ["feed-2"] },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("feed not-in is the inverse", () => {
    const a = article({ feedId: "feed-1" });
    expect(
      evaluateCondition(
        { kind: "feed", op: "not-in", value: ["feed-2"] },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("folder resolves through feedsById and matches by folder id", () => {
    const techFeed = feed({ id: "feed-1", folderId: "tech" });
    const a = article({ feedId: "feed-1" });
    expect(
      evaluateCondition(
        { kind: "folder", op: "in", value: ["tech"] },
        a,
        ctxWith([techFeed]),
      ),
    ).toBe(true);
  });

  it("folder evaluates to false when the feed is unknown (deleted/desync)", () => {
    const a = article({ feedId: "missing" });
    expect(
      evaluateCondition(
        { kind: "folder", op: "in", value: ["tech"] },
        a,
        ctxWith([feed({ id: "other" })]),
      ),
    ).toBe(false);
  });

  it("folder evaluates to false when the feed has no folder", () => {
    const a = article({ feedId: "feed-1" });
    expect(
      evaluateCondition(
        { kind: "folder", op: "in", value: ["tech"] },
        a,
        ctxWith([feed({ id: "feed-1" /* no folderId */ })]),
      ),
    ).toBe(false);
  });
});

// --- condition: publishedAt --------------------------------------------------

describe("evaluateCondition — publishedAt", () => {
  it("in-last-days uses ctx.now (deterministic, not Date.now)", () => {
    const a = article({ publishedAt: NOW - 3 * ONE_DAY });
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "in-last-days", value: 7 },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "in-last-days", value: 2 },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("in-last-hours respects ctx.now", () => {
    const a = article({ publishedAt: NOW - 2 * 60 * 60 * 1000 });
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "in-last-hours", value: 6 },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("before / after compare to a fixed epoch ms", () => {
    const a = article({ publishedAt: NOW });
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "before", value: NOW + 1 },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "after", value: NOW - 1 },
        a,
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("between is inclusive on both ends", () => {
    const a = article({ publishedAt: 1500 });
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "between", value: [1500, 2000] },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "publishedAt", op: "between", value: [2000, 3000] },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });
});

// --- boolean conditions ------------------------------------------------------

describe("evaluateCondition — read / starred / extracted", () => {
  it("read is true matches read articles", () => {
    expect(
      evaluateCondition(
        { kind: "read", op: "is", value: true },
        article({ read: true }),
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "read", op: "is", value: false },
        article({ read: true }),
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("starred is treats missing field as false", () => {
    expect(
      evaluateCondition(
        { kind: "starred", op: "is", value: false },
        article({ /* no starred */ }),
        ctxWith(),
      ),
    ).toBe(true);
  });

  it("extracted is true matches articles with persisted extractedContent", () => {
    expect(
      evaluateCondition(
        { kind: "extracted", op: "is", value: true },
        article({ extractedContent: "<p>full text</p>" }),
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { kind: "extracted", op: "is", value: false },
        article({ extractedContent: "" }),
        ctxWith(),
      ),
    ).toBe(true);
  });
});

// --- groups ------------------------------------------------------------------

describe("evaluateGroup — all / any / not", () => {
  it("'all' (AND) returns true only when every child matches", () => {
    const a = article({ title: "AI is on the rise", read: false });
    const group: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        { kind: "title", op: "contains", value: "AI" },
        { kind: "read", op: "is", value: false },
      ],
    };
    expect(evaluateGroup(group, a, ctxWith())).toBe(true);
  });

  it("'all' fails on a single non-matching child", () => {
    const a = article({ title: "AI is on the rise", read: true });
    const group: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        { kind: "title", op: "contains", value: "AI" },
        { kind: "read", op: "is", value: false },
      ],
    };
    expect(evaluateGroup(group, a, ctxWith())).toBe(false);
  });

  it("'any' (OR) returns true when at least one child matches", () => {
    const a = article({ title: "AI", starred: false });
    const group: ConditionGroup = {
      kind: "group",
      match: "any",
      children: [
        { kind: "title", op: "contains", value: "Apple" },
        { kind: "starred", op: "is", value: false },
      ],
    };
    expect(evaluateGroup(group, a, ctxWith())).toBe(true);
  });

  it("'not: true' inverts the whole group", () => {
    const a = article({ title: "AI" });
    const group: ConditionGroup = {
      kind: "group",
      match: "all",
      not: true,
      children: [{ kind: "title", op: "contains", value: "AI" }],
    };
    expect(evaluateGroup(group, a, ctxWith())).toBe(false);
  });

  it("empty 'all' group is vacuously true; empty 'any' group is vacuously false", () => {
    const a = article();
    expect(
      evaluateGroup(
        { kind: "group", match: "all", children: [] },
        a,
        ctxWith(),
      ),
    ).toBe(true);
    expect(
      evaluateGroup(
        { kind: "group", match: "any", children: [] },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("nested groups compose correctly", () => {
    const a = article({ title: "GPU benchmark", read: false, starred: true });
    const rule: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        { kind: "title", op: "contains", value: "GPU" },
        {
          kind: "group",
          match: "any",
          children: [
            { kind: "read", op: "is", value: false },
            { kind: "starred", op: "is", value: true },
          ],
        },
      ],
    };
    expect(evaluateGroup(rule, a, ctxWith())).toBe(true);
  });
});

// --- filterRef + cycle guard -------------------------------------------------

describe("evaluateCondition — filterRef + cycle guard", () => {
  it("filterRef delegates to the referenced filter", () => {
    const childFilter = filter({
      id: "child",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "title", op: "contains", value: "AI" }],
      },
    });
    const a = article({ title: "AI news" });
    const cond: Condition = { kind: "filterRef", op: "matches", value: "child" };
    expect(
      evaluateCondition(cond, a, ctxWith([feed()], [childFilter])),
    ).toBe(true);
  });

  it("filterRef returns false when the referenced filter is missing", () => {
    const a = article();
    expect(
      evaluateCondition(
        { kind: "filterRef", op: "matches", value: "missing" },
        a,
        ctxWith(),
      ),
    ).toBe(false);
  });

  it("filterRef cycle (A → B → A) resolves to false rather than infinite recursion", () => {
    const a = filter({
      id: "A",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "filterRef", op: "matches", value: "B" }],
      },
    });
    const b = filter({
      id: "B",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "filterRef", op: "matches", value: "A" }],
      },
    });
    const art = article();
    const ctx = ctxWith([feed()], [a, b]);
    // Should not throw and should resolve in finite time.
    expect(evaluateFilter(a, art, ctx)).toBe(false);
  });

  it("filterRef self-loop (A → A) resolves to false", () => {
    const a = filter({
      id: "A",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "filterRef", op: "matches", value: "A" }],
      },
    });
    const art = article();
    expect(evaluateFilter(a, art, ctxWith([feed()], [a]))).toBe(false);
  });
});

// --- top-level filter --------------------------------------------------------

describe("evaluateFilter (top-level)", () => {
  it("evaluates the rule against an article", () => {
    const f = filter({
      id: "F",
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "title", op: "contains", value: "AI" }],
      },
    });
    expect(evaluateFilter(f, article({ title: "AI" }), ctxWith())).toBe(true);
    expect(evaluateFilter(f, article({ title: "Sports" }), ctxWith())).toBe(false);
  });

  it("uses ctx.now from buildContext so date conditions are deterministic across one render", () => {
    const f = filter({
      rule: {
        kind: "group",
        match: "all",
        children: [{ kind: "publishedAt", op: "in-last-days", value: 1 }],
      },
    });
    // Two articles published 12h ago against a ctx.now stamp.
    const a1 = article({ publishedAt: NOW - 12 * 60 * 60 * 1000 });
    const a2 = article({ publishedAt: NOW - 12 * 60 * 60 * 1000 });
    const ctx = ctxWith();
    expect(evaluateFilter(f, a1, ctx)).toBe(true);
    expect(evaluateFilter(f, a2, ctx)).toBe(true);
  });
});
