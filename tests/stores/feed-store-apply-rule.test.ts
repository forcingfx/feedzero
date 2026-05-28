/**
 * feed-store action `applyRuleToExistingArticles`: backfills the named
 * rule across the articles already stored for a feed. Closes the gap
 * the engine docstring promises — until now, rules ran only at ingest,
 * so a "[Sponsor] → mute" rule did nothing to entries already in the
 * DB. The action loads from the article store, runs the rule against
 * each article, persists only the diff via `updateArticles`, and
 * schedules a sync push so muted state replicates.
 *
 * Per CLAUDE.md "mock at the boundary, not the collaborator", the db
 * and sync modules are mocked at module level; the real feed-store,
 * article-store, schema factories, and rule engine run end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Article, Feed, Rule, RuleAction } from "@feedzero/core/types";

vi.mock("../../src/core/storage/db.ts", () => {
  const feeds = new Map<string, Feed>();
  const articlesByFeedId = new Map<string, Article[]>();
  return {
    getFeeds: vi.fn(async () => ({ ok: true, value: [...feeds.values()] })),
    getFeed: vi.fn(async (id: string) => {
      const f = feeds.get(id);
      return f
        ? { ok: true as const, value: f }
        : { ok: false as const, error: "not found" };
    }),
    updateFeed: vi.fn(async (feed: Feed) => {
      feeds.set(feed.id, feed);
      return { ok: true, value: true };
    }),
    getAllArticles: vi.fn(async () => {
      const flat: Article[] = [];
      for (const list of articlesByFeedId.values()) flat.push(...list);
      return { ok: true as const, value: flat };
    }),
    getArticlesForFeed: vi.fn(async (feedId: string) => ({
      ok: true as const,
      value: articlesByFeedId.get(feedId) ?? [],
    })),
    updateArticles: vi.fn(async (updates: Article[]) => {
      for (const u of updates) {
        const list = articlesByFeedId.get(u.feedId);
        if (!list) continue;
        const i = list.findIndex((a) => a.id === u.id);
        if (i >= 0) list[i] = u;
      }
      return { ok: true, value: true };
    }),
    addFolder: vi.fn(),
    getFolders: vi.fn(async () => ({ ok: true, value: [] })),
    updateFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeFeed: vi.fn(async () => ({ ok: true, value: true })),
    _feeds: feeds,
    _articles: articlesByFeedId,
    _seedFeed: (f: Feed) => feeds.set(f.id, f),
    _seedArticles: (feedId: string, list: Article[]) =>
      articlesByFeedId.set(feedId, list),
    _reset: () => {
      feeds.clear();
      articlesByFeedId.clear();
    },
  };
});

vi.mock("../../src/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("../../src/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn().mockResolvedValue({
    ok: true,
    value: { extracted: 0, failed: 0 },
  }),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("../../src/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: () => true,
}));

import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useArticleStore } from "../../src/stores/article-store.ts";
import * as db from "../../src/core/storage/db.ts";

const dbMock = db as unknown as {
  _feeds: Map<string, Feed>;
  _articles: Map<string, Article[]>;
  _seedFeed: (f: Feed) => void;
  _seedArticles: (feedId: string, list: Article[]) => void;
  _reset: () => void;
};

function feed(id: string, rules?: Rule[]): Feed {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title: id,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
    ...(rules ? { rules } : {}),
  };
}

function article(id: string, feedId: string, overrides: Partial<Article> = {}): Article {
  return {
    id,
    feedId,
    guid: id,
    title: id,
    link: `https://example.com/${id}`,
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

function muteRule(id: string, titleSubstring: string, actions: RuleAction[] = [{ kind: "mute" }]): Rule {
  return {
    id,
    name: `Mute ${titleSubstring}`,
    enabled: true,
    condition: {
      kind: "group",
      match: "all",
      children: [{ kind: "title", op: "contains", value: titleSubstring }],
    },
    actions,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("feed-store · applyRuleToExistingArticles", () => {
  let schedulePushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dbMock._reset();
    vi.clearAllMocks();
    useLicenseStore.setState({ tier: "personal" });
    useFeedStore.setState({ feeds: [], folders: [] });
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    schedulePushSpy = vi
      .spyOn(useSyncStore.getState(), "scheduleSyncPush")
      .mockImplementation(() => {});
  });

  it("backfills mute on articles that match the rule's condition", async () => {
    const rule = muteRule("r-1", "[Sponsor]");
    const f = feed("f1", [rule]);
    dbMock._seedFeed(f);
    const articles = [
      article("a-1", "f1", { title: "[Sponsor] exe.dev" }),
      article("a-2", "f1", { title: "Talk Show #999" }),
      article("a-3", "f1", { title: "[Sponsor] WorkOS" }),
    ];
    dbMock._seedArticles("f1", articles);
    useFeedStore.setState({ feeds: [f] });
    useArticleStore.setState({
      articlesByFeedId: { f1: articles.map((a) => ({ ...a })) },
    });

    const result = await useFeedStore
      .getState()
      .applyRuleToExistingArticles("f1", "r-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.changed).toBe(2);
      expect(result.value.total).toBe(3);
    }
    const persisted = dbMock._articles.get("f1")!;
    expect(persisted.find((a) => a.id === "a-1")!.muted).toBe(true);
    expect(persisted.find((a) => a.id === "a-2")!.muted).toBeFalsy();
    expect(persisted.find((a) => a.id === "a-3")!.muted).toBe(true);
  });

  it("is idempotent — running again returns changed=0", async () => {
    const rule = muteRule("r-1", "[Sponsor]");
    dbMock._seedFeed(feed("f1", [rule]));
    const articles = [article("a-1", "f1", { title: "[Sponsor] exe.dev" })];
    dbMock._seedArticles("f1", articles);
    useFeedStore.setState({ feeds: [feed("f1", [rule])] });
    useArticleStore.setState({
      articlesByFeedId: { f1: articles.map((a) => ({ ...a })) },
    });

    await useFeedStore.getState().applyRuleToExistingArticles("f1", "r-1");
    // Re-seed the article-store with the now-muted state (mirrors the
    // reload that would happen between two real user clicks).
    useArticleStore.setState({
      articlesByFeedId: {
        f1: dbMock._articles.get("f1")!.map((a) => ({ ...a })),
      },
    });
    const second = await useFeedStore
      .getState()
      .applyRuleToExistingArticles("f1", "r-1");

    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.changed).toBe(0);
  });

  it("schedules a sync push when at least one article changes", async () => {
    const rule = muteRule("r-1", "[Sponsor]");
    dbMock._seedFeed(feed("f1", [rule]));
    const articles = [article("a-1", "f1", { title: "[Sponsor] exe.dev" })];
    dbMock._seedArticles("f1", articles);
    useFeedStore.setState({ feeds: [feed("f1", [rule])] });
    useArticleStore.setState({
      articlesByFeedId: { f1: articles.map((a) => ({ ...a })) },
    });

    await useFeedStore.getState().applyRuleToExistingArticles("f1", "r-1");
    expect(schedulePushSpy).toHaveBeenCalled();
  });

  it("does NOT schedule a sync push when no article changes (zero-diff write avoided)", async () => {
    const rule = muteRule("r-1", "never-matches");
    dbMock._seedFeed(feed("f1", [rule]));
    const articles = [article("a-1", "f1", { title: "Normal post" })];
    dbMock._seedArticles("f1", articles);
    useFeedStore.setState({ feeds: [feed("f1", [rule])] });
    useArticleStore.setState({
      articlesByFeedId: { f1: articles.map((a) => ({ ...a })) },
    });

    await useFeedStore.getState().applyRuleToExistingArticles("f1", "r-1");
    expect(schedulePushSpy).not.toHaveBeenCalled();
  });

  it("returns an error result when the feed has no rule with that id", async () => {
    dbMock._seedFeed(feed("f1"));
    useFeedStore.setState({ feeds: [feed("f1")] });

    const result = await useFeedStore
      .getState()
      .applyRuleToExistingArticles("f1", "r-ghost");

    expect(result.ok).toBe(false);
  });

  it("refuses when the rules feature is gate-locked (free user)", async () => {
    useLicenseStore.setState({ tier: "free" });
    const rule = muteRule("r-1", "[Sponsor]");
    dbMock._seedFeed(feed("f1", [rule]));

    const result = await useFeedStore
      .getState()
      .applyRuleToExistingArticles("f1", "r-1");

    expect(result.ok).toBe(false);
  });
});
