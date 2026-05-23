/**
 * feed-store rule CRUD: addFeedRule, updateFeedRule, removeFeedRule,
 * reorderFeedRules. Mirrors the smart-filter-store pattern (load →
 * mutate via the encrypted db helper → reload → schedule sync push).
 *
 * Per CLAUDE.md "mock at the boundary, not the collaborator", these
 * tests mock the db module (the storage boundary) and the
 * sync-service module (the network boundary). The real feed-store
 * mutators, schema factories, and rule shape are exercised end-to-end.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Feed, Rule, RuleAction } from "@feedzero/core/types";

vi.mock("../../src/core/storage/db.ts", () => {
  const feeds = new Map<string, Feed>();
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
    addFolder: vi.fn(),
    getFolders: vi.fn(async () => ({ ok: true, value: [] })),
    updateFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeFeed: vi.fn(async () => ({ ok: true, value: true })),
    _feeds: feeds,
    _seed: (f: Feed) => feeds.set(f.id, f),
    _reset: () => feeds.clear(),
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

// Force paid tier active in tests so the gate actually enforces tier
// requirements; without this VITE_PAID_TIER_VISIBLE is unset and the
// gate "relaxes" — all shipped Personal features become available to
// free users with reason: "paid-tier-inactive".
vi.mock("../../src/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: () => true,
}));

import { useFeedStore } from "../../src/stores/feed-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import * as db from "../../src/core/storage/db.ts";

const dbMock = db as unknown as {
  _feeds: Map<string, Feed>;
  _seed: (f: Feed) => void;
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

function rule(id: string, name = id, actions: RuleAction[] = [{ kind: "mute" }]): Rule {
  return {
    id,
    name,
    enabled: true,
    condition: { kind: "group", match: "all", children: [] },
    actions,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("feed-store rule CRUD", () => {
  let schedulePushSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    dbMock._reset();
    vi.clearAllMocks();
    useLicenseStore.setState({ tier: "personal" });
    useFeedStore.setState({ feeds: [], folders: [] });
    schedulePushSpy = vi
      .spyOn(useSyncStore.getState(), "scheduleSyncPush")
      .mockImplementation(() => {});
  });

  describe("addFeedRule", () => {
    it("appends a rule to a feed that has none", async () => {
      const f = feed("f1");
      dbMock._seed(f);
      useFeedStore.setState({ feeds: [f] });

      const result = await useFeedStore.getState().addFeedRule("f1", {
        name: "Mute sponsored",
        condition: { kind: "group", match: "all", children: [] },
        actions: [{ kind: "mute" }],
      });

      expect(result.ok).toBe(true);
      const persisted = dbMock._feeds.get("f1")!;
      expect(persisted.rules).toHaveLength(1);
      expect(persisted.rules?.[0].name).toBe("Mute sponsored");
      expect(persisted.rules?.[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-/,
      );
    });

    it("appends to a feed that already has rules without mutating prior entries", async () => {
      const existing = rule("r-existing", "Existing rule");
      const f = feed("f1", [existing]);
      dbMock._seed(f);
      useFeedStore.setState({ feeds: [f] });

      await useFeedStore.getState().addFeedRule("f1", {
        name: "Second rule",
        condition: { kind: "group", match: "all", children: [] },
        actions: [{ kind: "star" }],
      });

      const persisted = dbMock._feeds.get("f1")!;
      expect(persisted.rules).toHaveLength(2);
      expect(persisted.rules?.[0]).toMatchObject({ id: "r-existing" });
      expect(persisted.rules?.[1].name).toBe("Second rule");
    });

    it("schedules a sync push so other devices see the new rule", async () => {
      dbMock._seed(feed("f1"));
      await useFeedStore.getState().addFeedRule("f1", {
        name: "Any",
        condition: { kind: "group", match: "all", children: [] },
        actions: [{ kind: "mute" }],
      });
      expect(schedulePushSpy).toHaveBeenCalled();
    });

    it("refuses to add a rule for a free user (gate-locked)", async () => {
      useLicenseStore.setState({ tier: "free" });
      dbMock._seed(feed("f1"));

      const result = await useFeedStore.getState().addFeedRule("f1", {
        name: "Mute sponsored",
        condition: { kind: "group", match: "all", children: [] },
        actions: [{ kind: "mute" }],
      });

      expect(result.ok).toBe(false);
      expect(dbMock._feeds.get("f1")!.rules).toBeUndefined();
    });

    it("rejects an input that schema validation rejects (no actions)", async () => {
      dbMock._seed(feed("f1"));
      const result = await useFeedStore.getState().addFeedRule("f1", {
        name: "Empty",
        condition: { kind: "group", match: "all", children: [] },
        actions: [],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("updateFeedRule", () => {
    it("replaces a rule by id and updates updatedAt", async () => {
      const original = rule("r-1", "Original");
      const f = feed("f1", [original]);
      dbMock._seed(f);
      useFeedStore.setState({ feeds: [f] });

      const before = Date.now();
      const result = await useFeedStore.getState().updateFeedRule("f1", {
        ...original,
        name: "Updated",
      });

      expect(result.ok).toBe(true);
      const persisted = dbMock._feeds.get("f1")!.rules?.[0];
      expect(persisted?.name).toBe("Updated");
      expect(persisted?.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it("is a no-op when the rule id doesn't exist on the feed", async () => {
      const f = feed("f1", [rule("r-1")]);
      dbMock._seed(f);
      const before = dbMock._feeds.get("f1")!.rules?.[0];

      const result = await useFeedStore
        .getState()
        .updateFeedRule("f1", { ...rule("r-unknown"), name: "Ghost" });

      expect(result.ok).toBe(false);
      expect(dbMock._feeds.get("f1")!.rules?.[0]).toEqual(before);
    });
  });

  describe("removeFeedRule", () => {
    it("drops a rule by id", async () => {
      const r1 = rule("r-1");
      const r2 = rule("r-2");
      const f = feed("f1", [r1, r2]);
      dbMock._seed(f);
      useFeedStore.setState({ feeds: [f] });

      await useFeedStore.getState().removeFeedRule("f1", "r-1");

      const persisted = dbMock._feeds.get("f1")!;
      expect(persisted.rules).toHaveLength(1);
      expect(persisted.rules?.[0].id).toBe("r-2");
    });

    it("is idempotent on an unknown id", async () => {
      dbMock._seed(feed("f1", [rule("r-1")]));
      await useFeedStore.getState().removeFeedRule("f1", "r-unknown");
      expect(dbMock._feeds.get("f1")!.rules).toHaveLength(1);
    });
  });

  describe("reorderFeedRules", () => {
    it("rewrites the order to match the supplied id list", async () => {
      const a = rule("r-a");
      const b = rule("r-b");
      const c = rule("r-c");
      dbMock._seed(feed("f1", [a, b, c]));

      await useFeedStore.getState().reorderFeedRules("f1", ["r-c", "r-a", "r-b"]);

      const ids = dbMock._feeds.get("f1")!.rules?.map((r) => r.id);
      expect(ids).toEqual(["r-c", "r-a", "r-b"]);
    });

    it("ignores unknown ids in the supplied list (defensive)", async () => {
      dbMock._seed(feed("f1", [rule("r-a"), rule("r-b")]));
      await useFeedStore
        .getState()
        .reorderFeedRules("f1", ["r-b", "r-ghost", "r-a"]);

      const ids = dbMock._feeds.get("f1")!.rules?.map((r) => r.id);
      expect(ids).toEqual(["r-b", "r-a"]);
    });
  });
});
