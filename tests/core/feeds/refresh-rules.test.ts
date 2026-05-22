/**
 * Integration: refreshFeed applies the feed's per-feed rules to each
 * newly-ingested article before persistence. Mocks the db boundary
 * only (per CLAUDE.md "mock at the boundary"), exercises the real
 * rules engine + filter evaluator end to end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Article, Feed, Rule } from "../../../src/types/index.ts";

const SPONSORED_FEED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Mixed Feed</title>
  <link href="https://example.com" rel="alternate"/>
  <entry>
    <title>Real article about something</title>
    <link href="https://example.com/real-1" rel="alternate"/>
    <id>real-1</id>
    <published>2024-01-15T12:00:00Z</published>
    <content type="html">&lt;p&gt;Body&lt;/p&gt;</content>
    <author><name>Alice</name></author>
  </entry>
  <entry>
    <title>Sponsored: Buy this thing</title>
    <link href="https://example.com/spam-1" rel="alternate"/>
    <id>spam-1</id>
    <published>2024-01-15T13:00:00Z</published>
    <content type="html">&lt;p&gt;Ad&lt;/p&gt;</content>
    <author><name>Bob</name></author>
  </entry>
</feed>`;

vi.mock("../../../src/core/storage/db.ts", () => {
  const articles = new Map<string, Article>();
  return {
    getArticleByGuid: vi.fn(async () => ({ ok: true, value: null })),
    addArticles: vi.fn(async (arts: Article[]) => {
      for (const a of arts) articles.set(a.id, a);
      return { ok: true, value: true };
    }),
    updateArticles: vi.fn(async () => ({ ok: true, value: true })),
    updateFeed: vi.fn(async () => ({ ok: true, value: true })),
    dedupeArticles: vi.fn(async () => ({ ok: true, value: 0 })),
    _articles: articles,
    _reset: () => articles.clear(),
  };
});

let refreshFeed: typeof import("../../../src/core/feeds/feed-service.ts").refreshFeed;
let db: typeof import("../../../src/core/storage/db.ts") & {
  _articles: Map<string, Article>;
  _reset: () => void;
};

beforeEach(async () => {
  db = (await import("../../../src/core/storage/db.ts")) as never;
  db._reset();
  vi.clearAllMocks();

  const mod = await import("../../../src/core/feeds/feed-service.ts");
  refreshFeed = mod.refreshFeed;

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(SPONSORED_FEED_XML),
  });
});

function feed(rules: Rule[] = []): Feed {
  return {
    id: "f-test",
    url: "https://example.com/feed.xml",
    title: "Test feed",
    description: "",
    siteUrl: "https://example.com",
    createdAt: 0,
    updatedAt: 0,
    rules,
  };
}

function muteSponsoredRule(): Rule {
  return {
    id: "r-mute",
    name: "Mute sponsored",
    enabled: true,
    condition: {
      kind: "group",
      match: "all",
      children: [{ kind: "title", op: "contains", value: "Sponsored" }],
    },
    actions: [{ kind: "mute" }],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("refreshFeed × rules", () => {
  it("applies a feed's rules to newly-ingested articles", async () => {
    const result = await refreshFeed(feed([muteSponsoredRule()]));
    expect(result.ok).toBe(true);

    const persisted = Array.from(db._articles.values());
    expect(persisted).toHaveLength(2);

    const real = persisted.find((a) => a.title.startsWith("Real"));
    const sponsored = persisted.find((a) => a.title.startsWith("Sponsored"));

    // Sponsored article muted by the rule
    expect(sponsored?.muted).toBe(true);
    // Real article untouched
    expect(real?.muted).toBeUndefined();
  });

  it("is a no-op when the feed has no rules", async () => {
    const result = await refreshFeed(feed([]));
    expect(result.ok).toBe(true);

    const persisted = Array.from(db._articles.values());
    expect(persisted).toHaveLength(2);
    expect(persisted.every((a) => !a.muted)).toBe(true);
  });

  it("is a no-op when the feed's rules field is undefined (older vault)", async () => {
    const f = feed();
    delete (f as Partial<Feed>).rules;
    const result = await refreshFeed(f);
    expect(result.ok).toBe(true);
    expect(Array.from(db._articles.values()).every((a) => !a.muted)).toBe(true);
  });

  it("applies multiple actions from a single rule (star + mark-read)", async () => {
    const r: Rule = {
      ...muteSponsoredRule(),
      id: "r-multi",
      name: "Star + read sponsored",
      actions: [{ kind: "star" }, { kind: "mark-read" }],
    };
    await refreshFeed(feed([r]));
    const sponsored = Array.from(db._articles.values()).find((a) =>
      a.title.startsWith("Sponsored"),
    );
    expect(sponsored?.starred).toBe(true);
    expect(sponsored?.read).toBe(true);
  });

  it("does not apply disabled rules", async () => {
    const r: Rule = { ...muteSponsoredRule(), enabled: false };
    await refreshFeed(feed([r]));
    const sponsored = Array.from(db._articles.values()).find((a) =>
      a.title.startsWith("Sponsored"),
    );
    expect(sponsored?.muted).toBeUndefined();
  });

  it("route-to-folder sets the article-level folderId override", async () => {
    const r: Rule = {
      ...muteSponsoredRule(),
      actions: [{ kind: "route-to-folder", folderId: "folder-spam" }],
    };
    await refreshFeed(feed([r]));
    const sponsored = Array.from(db._articles.values()).find((a) =>
      a.title.startsWith("Sponsored"),
    );
    expect(sponsored?.folderId).toBe("folder-spam");
  });
});
