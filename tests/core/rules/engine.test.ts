import { describe, it, expect } from "vitest";
import {
  applyRules,
  applyRuleToExisting,
} from "../../../src/core/rules/engine.ts";
import { buildContext } from "../../../src/core/filters/evaluator.ts";
import type {
  Article,
  Feed,
  Rule,
  ConditionGroup,
} from "@feedzero/core/types";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a-1",
    feedId: "f-1",
    guid: "g-1",
    title: "Hello world",
    link: "https://example.com/a-1",
    content: "Body",
    summary: "Summary",
    author: "Alice",
    publishedAt: 1_700_000_000_000,
    read: false,
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

function feed(overrides: Partial<Feed> = {}): Feed {
  return {
    id: "f-1",
    url: "https://example.com/feed.xml",
    title: "Example",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function rule(
  condition: ConditionGroup,
  actions: Rule["actions"],
  overrides: Partial<Rule> = {},
): Rule {
  return {
    id: "r-1",
    name: "Test rule",
    enabled: true,
    condition,
    actions,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

const titleContains = (value: string): ConditionGroup => ({
  kind: "group",
  match: "all",
  children: [{ kind: "title", op: "contains", value }],
});

describe("applyRules", () => {
  const ctx = buildContext({ feeds: [feed()], filters: [] });

  it("returns the article unchanged when no rules are provided", () => {
    const out = applyRules(article(), [], ctx);
    expect(out).toEqual(article());
  });

  it("returns the article unchanged when no rule matches", () => {
    const r = rule(titleContains("never matches"), [{ kind: "mute" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.muted).toBeUndefined();
  });

  it("applies mute action when condition matches", () => {
    const r = rule(titleContains("Hello"), [{ kind: "mute" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.muted).toBe(true);
  });

  it("applies star action when condition matches", () => {
    const r = rule(titleContains("Hello"), [{ kind: "star" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.starred).toBe(true);
    expect(out.starredAt).toBeGreaterThan(0);
  });

  it("applies mark-read action when condition matches", () => {
    const r = rule(titleContains("Hello"), [{ kind: "mark-read" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.read).toBe(true);
  });

  it("applies route-to-folder action when condition matches", () => {
    const r = rule(titleContains("Hello"), [
      { kind: "route-to-folder", folderId: "folder-X" },
    ]);
    const out = applyRules(article(), [r], ctx);
    expect(out.folderId).toBe("folder-X");
  });

  it("applies multiple actions in a single rule (star + mark-read)", () => {
    const r = rule(titleContains("Hello"), [
      { kind: "star" },
      { kind: "mark-read" },
    ]);
    const out = applyRules(article(), [r], ctx);
    expect(out.starred).toBe(true);
    expect(out.read).toBe(true);
  });

  it("applies actions across multiple matching rules in order", () => {
    const rules = [
      rule(titleContains("Hello"), [{ kind: "star" }], { id: "r-a" }),
      rule(titleContains("world"), [{ kind: "mark-read" }], { id: "r-b" }),
    ];
    const out = applyRules(article(), rules, ctx);
    expect(out.starred).toBe(true);
    expect(out.read).toBe(true);
  });

  it("later route-to-folder rule overrides earlier one (deterministic last-wins)", () => {
    const rules = [
      rule(titleContains("Hello"), [{ kind: "route-to-folder", folderId: "first" }], { id: "r-a" }),
      rule(titleContains("Hello"), [{ kind: "route-to-folder", folderId: "second" }], { id: "r-b" }),
    ];
    const out = applyRules(article(), rules, ctx);
    expect(out.folderId).toBe("second");
  });

  it("skips disabled rules even when their condition matches", () => {
    const r = rule(titleContains("Hello"), [{ kind: "mute" }], { enabled: false });
    const out = applyRules(article(), [r], ctx);
    expect(out.muted).toBeUndefined();
  });

  it("does not mutate the input article (pure function)", () => {
    const input = article();
    const r = rule(titleContains("Hello"), [{ kind: "mute" }]);
    applyRules(input, [r], ctx);
    expect(input.muted).toBeUndefined();
  });

  it("preserves existing fields not touched by actions", () => {
    const input = article({ author: "Important", content: "<p>keep</p>" });
    const r = rule(titleContains("Hello"), [{ kind: "mute" }]);
    const out = applyRules(input, [r], ctx);
    expect(out.author).toBe("Important");
    expect(out.content).toBe("<p>keep</p>");
    expect(out.muted).toBe(true);
  });

  it("respects existing read state (mark-read on an already-read article is a no-op-ish)", () => {
    const input = article({ read: true });
    const r = rule(titleContains("Hello"), [{ kind: "mark-read" }]);
    const out = applyRules(input, [r], ctx);
    expect(out.read).toBe(true);
  });

  it("supports AND groups (match: 'all')", () => {
    const cond: ConditionGroup = {
      kind: "group",
      match: "all",
      children: [
        { kind: "title", op: "contains", value: "Hello" },
        { kind: "author", op: "contains", value: "Alice" },
      ],
    };
    const r = rule(cond, [{ kind: "mute" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.muted).toBe(true);
  });

  it("supports OR groups (match: 'any')", () => {
    const cond: ConditionGroup = {
      kind: "group",
      match: "any",
      children: [
        { kind: "title", op: "contains", value: "never" },
        { kind: "author", op: "contains", value: "Alice" },
      ],
    };
    const r = rule(cond, [{ kind: "mute" }]);
    const out = applyRules(article(), [r], ctx);
    expect(out.muted).toBe(true);
  });
});

describe("applyRuleToExisting", () => {
  const ctx = buildContext({ feeds: [feed()], filters: [] });

  it("returns the subset of articles the rule actually changes", () => {
    const muteHello = rule(titleContains("Hello"), [{ kind: "mute" }]);
    const articles = [
      article({ id: "a", title: "Hello world", muted: false }),
      article({ id: "b", title: "Goodbye world", muted: false }),
      article({ id: "c", title: "Hello again", muted: false }),
    ];
    const { changed } = applyRuleToExisting(articles, muteHello, ctx);
    expect(changed.map((a) => a.id).sort()).toEqual(["a", "c"]);
    expect(changed.every((a) => a.muted === true)).toBe(true);
  });

  it("skips articles already in the rule's terminal state (idempotent)", () => {
    // Articles where mute=true already need no update — including them in
    // the changed set would cause needless re-encryption + IndexedDB writes
    // on every Run-now click. The contract is "diff only".
    const muteHello = rule(titleContains("Hello"), [{ kind: "mute" }]);
    const articles = [
      article({ id: "a", title: "Hello world", muted: true }),
      article({ id: "b", title: "Hello again", muted: false }),
    ];
    const { changed } = applyRuleToExisting(articles, muteHello, ctx);
    expect(changed.map((a) => a.id)).toEqual(["b"]);
  });

  it("returns the empty array when no article matches", () => {
    const muteNever = rule(titleContains("never matches"), [{ kind: "mute" }]);
    const { changed } = applyRuleToExisting(
      [article({ id: "a", title: "Hello world" })],
      muteNever,
      ctx,
    );
    expect(changed).toEqual([]);
  });

  it("returns the empty array when the rule is disabled", () => {
    const muteHello = rule(titleContains("Hello"), [{ kind: "mute" }], {
      enabled: false,
    });
    const { changed } = applyRuleToExisting(
      [article({ id: "a", title: "Hello world" })],
      muteHello,
      ctx,
    );
    expect(changed).toEqual([]);
  });

  it("does not mutate the input articles (pure function)", () => {
    const input = [article({ id: "a", title: "Hello world", muted: false })];
    const muteHello = rule(titleContains("Hello"), [{ kind: "mute" }]);
    applyRuleToExisting(input, muteHello, ctx);
    expect(input[0].muted).toBe(false);
  });
});
