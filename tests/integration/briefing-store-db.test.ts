/**
 * Integration tests for the briefing-store ↔ db.ts boundary.
 *
 * Mock-at-the-boundary: only the LLM call (briefing-client) and the
 * feed-discovery network (feed-suggester) are mocked. The store, the
 * service, the matcher, the score, the secrets table, and db.ts all
 * run for real against fake-indexeddb. This is the same pattern as
 * feed-store-db.test.ts and sync-store-db.test.ts — see the comment in
 * those files for the SEV history that motivated the rule.
 *
 * What this file locks down:
 *  1. createBriefing produces a real, decryptable DB row.
 *  2. refreshBriefing persists the generated report; a subsequent
 *     load from the db round-trips through the encryption envelope.
 *  3. The "no-api-key" gate fires before any LLM call when the
 *     secrets table is empty.
 *  4. The signal-score gate ("not-enough-evidence") fires before any
 *     LLM call when the corpus is too thin.
 *  5. refreshStaleCounts updates only the rows whose count changed
 *     and persists them through real updateBriefing.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useBriefingStore } from "../../src/stores/briefing-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import {
  open,
  close,
  deleteDatabase,
  getBriefings as dbGetBriefings,
} from "../../src/core/storage/db.ts";
import { setAnthropicKey } from "../../src/core/storage/secrets.ts";
import { ok, err } from "../../packages/core/src/utils/result";
import type { Article, BriefingReport } from "@feedzero/core/types";

const generateBriefingMock = vi.hoisted(() => vi.fn());
const resolveSuggestedFeedsMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/core/briefings/briefing-client", () => ({
  generateBriefing: generateBriefingMock,
}));

vi.mock("../../src/core/briefings/feed-suggester", () => ({
  resolveSuggestedFeeds: resolveSuggestedFeedsMock,
}));

vi.spyOn(useSyncStore.getState(), "scheduleSyncPush").mockImplementation(() => {});

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function article(
  feedId: string,
  daysAgo: number,
  title: string,
  createdAgo = daysAgo,
): Article {
  return {
    id: crypto.randomUUID(),
    feedId,
    guid: crypto.randomUUID(),
    title,
    link: "https://example.com/x",
    content: "",
    summary: "",
    author: "",
    publishedAt: NOW - daysAgo * DAY,
    read: false,
    createdAt: NOW - createdAgo * DAY,
  };
}

function strongCorpus(prompt = "EU AI Act"): Article[] {
  const out: Article[] = [];
  for (let f = 0; f < 5; f++) {
    for (let i = 0; i < 2; i++) {
      out.push(article(`feed-${f}`, i + 1, `${prompt} update ${i}`));
    }
  }
  return out;
}

function reportFromClient(overrides: Partial<BriefingReport> = {}): BriefingReport {
  return {
    schemaVersion: 1,
    abstract: "Summary [A1].",
    citations: [{ articleId: "a-1", quote: "Quote" }],
    signalScore: 0,
    suggestedFeeds: [],
    matchedArticleIds: ["a-1"],
    modelId: "claude-sonnet-4-6",
    tokenUsage: { input: 100, output: 50 },
    generatedAt: NOW,
    ...overrides,
  };
}

describe("briefing-store ↔ db.ts integration", () => {
  beforeEach(async () => {
    // Reset store state between tests so leakage from one test doesn't
    // populate another's initial snapshot.
    useBriefingStore.setState({
      briefings: [],
      isLoading: false,
      statusById: new Map(),
      errorById: new Map(),
      pendingScoreById: new Map(),
      loadingStartedAtById: new Map(),
    });
    // Pro tier so the feature gate is open.
    useLicenseStore.setState({ tier: "pro" });

    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);

    generateBriefingMock.mockReset();
    resolveSuggestedFeedsMock.mockReset();
    resolveSuggestedFeedsMock.mockImplementation(async (s) => s);
  });

  afterEach(() => {
    close();
  });

  it("createBriefing persists a real, decryptable DB row", async () => {
    const result = await useBriefingStore
      .getState()
      .createBriefing({ name: "EU policy", prompt: "Track EU AI Act." });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    expect(fromDb.value).toHaveLength(1);
    expect(fromDb.value[0].name).toBe("EU policy");
    expect(fromDb.value[0].id).toBe(result.value.id);
    expect(fromDb.value[0].lastReport).toBeNull();
  });

  it("refreshBriefing returns no-api-key when the secrets table is empty (no LLM call)", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "X", prompt: "blockchain" });
    if (!created.ok) throw new Error("create failed");

    const result = await useBriefingStore.getState().refreshBriefing(
      created.value.id,
      { articles: strongCorpus() },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-api-key");
    expect(generateBriefingMock).not.toHaveBeenCalled();

    const status = useBriefingStore.getState().statusById.get(created.value.id);
    expect(status).toBe("no-api-key");
  });

  it("refreshBriefing returns not-enough-evidence and never calls the LLM for a thin corpus", async () => {
    await setAnthropicKey("sk-ant-test");
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "X", prompt: "blockchain" });
    if (!created.ok) throw new Error("create failed");

    const result = await useBriefingStore.getState().refreshBriefing(
      created.value.id,
      { articles: [article("feed-1", 1, "blockchain news")] },
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-enough-evidence");
    expect(typeof result.signalScore).toBe("number");
    expect(generateBriefingMock).not.toHaveBeenCalled();

    const score = useBriefingStore
      .getState()
      .pendingScoreById.get(created.value.id);
    expect(score).toBe(result.signalScore);
  });

  it("refreshBriefing persists the generated report and round-trips through encryption", async () => {
    await setAnthropicKey("sk-ant-test");
    generateBriefingMock.mockResolvedValueOnce(
      ok(reportFromClient({ abstract: "## Briefing\n\nKey developments [A1]." })),
    );

    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "EU AI", prompt: "EU AI Act enforcement" });
    if (!created.ok) throw new Error("create failed");

    const result = await useBriefingStore
      .getState()
      .refreshBriefing(created.value.id, { articles: strongCorpus("EU AI Act") });
    expect(result.ok).toBe(true);

    // Round-trip: read straight from db, decrypt, confirm shape survived.
    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    const persisted = fromDb.value.find((b) => b.id === created.value.id);
    expect(persisted).toBeDefined();
    expect(persisted!.lastReport).not.toBeNull();
    expect(persisted!.lastReport!.abstract).toBe(
      "## Briefing\n\nKey developments [A1].",
    );
    expect(persisted!.lastRunAt).not.toBeNull();
    expect(persisted!.staleArticleCount).toBe(0);
    // Service-overridden signalScore from the local matcher (not 0).
    expect(persisted!.lastReport!.signalScore).toBeGreaterThan(0);

    const status = useBriefingStore.getState().statusById.get(created.value.id);
    expect(status).toBe("ready");
  });

  it("stamps loadingStartedAt while a refresh is in flight and clears it on resolution", async () => {
    // Why this lives in the store, not in briefing-page React state:
    // navigating away from /briefings/:id while a refresh is running
    // unmounts the page. If the timer is local React state, remounting
    // resets it to "now" and the "elapsed time" lies. The skeleton needs
    // the wall-clock from when the refresh actually started — which only
    // the store, the same module that drives the in-flight Promise, has.
    await setAnthropicKey("sk-ant-test");
    let resolveClient: ((v: ReturnType<typeof ok<BriefingReport>>) => void) | null = null;
    generateBriefingMock.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveClient = r;
        }),
    );

    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "EU AI", prompt: "EU AI Act enforcement" });
    if (!created.ok) throw new Error("create failed");

    const refreshPromise = useBriefingStore
      .getState()
      .refreshBriefing(created.value.id, { articles: strongCorpus("EU AI Act") });

    // Drive the microtask queue until refreshBriefingFlow has reached
    // the (suspended) generateBriefing call. While the LLM call is
    // suspended, the store should already record the start timestamp so
    // a remounted page can read it.
    await vi.waitFor(() => {
      expect(resolveClient).not.toBeNull();
    });

    const startedAt = useBriefingStore
      .getState()
      .loadingStartedAtById.get(created.value.id);
    expect(typeof startedAt).toBe("number");
    expect(startedAt!).toBeLessThanOrEqual(Date.now());
    expect(startedAt!).toBeGreaterThan(Date.now() - 5_000);

    resolveClient!(ok(reportFromClient()));
    await refreshPromise;

    // Cleared on resolution so a follow-up loading run gets a fresh stamp.
    expect(
      useBriefingStore.getState().loadingStartedAtById.has(created.value.id),
    ).toBe(false);
  });

  it("client error path persists nothing and surfaces status:error", async () => {
    await setAnthropicKey("sk-ant-test");
    generateBriefingMock.mockResolvedValueOnce(err("Anthropic rate limit hit."));
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "X", prompt: "EU AI Act" });
    if (!created.ok) throw new Error("create failed");

    const result = await useBriefingStore
      .getState()
      .refreshBriefing(created.value.id, { articles: strongCorpus() });
    expect(result.ok).toBe(false);

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    const persisted = fromDb.value.find((b) => b.id === created.value.id);
    expect(persisted!.lastReport).toBeNull();

    expect(useBriefingStore.getState().statusById.get(created.value.id)).toBe(
      "error",
    );
    expect(
      useBriefingStore.getState().errorById.get(created.value.id),
    ).toMatch(/rate/i);
  });

  it("renameBriefing updates the row in place and the rename survives encryption", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "Original", prompt: "x" });
    if (!created.ok) throw new Error("create failed");

    await useBriefingStore.getState().renameBriefing(created.value.id, "Renamed");

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    expect(fromDb.value).toHaveLength(1);
    expect(fromDb.value[0].name).toBe("Renamed");
  });

  /**
   * `dailyRefresh` is the per-briefing opt-in for the midnight
   * scheduler. The flag must persist through the encryption envelope
   * so a reload (or sync pull on another device) preserves the
   * choice — otherwise the user wakes up to a missing nightly run.
   * createBriefing defaults to false; setBriefingDailyRefresh flips
   * it; the round-trip lands in the encrypted row.
   */
  it("createBriefing defaults dailyRefresh to false on the persisted row", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "Defaults", prompt: "x" });
    if (!created.ok) throw new Error("create failed");
    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    expect(fromDb.value[0].dailyRefresh).toBe(false);
  });

  it("setBriefingDailyRefresh persists the flag through encryption", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "Nightly fan", prompt: "x" });
    if (!created.ok) throw new Error("create failed");

    const flipped = await useBriefingStore
      .getState()
      .setBriefingDailyRefresh(created.value.id, true);
    expect(flipped.ok).toBe(true);
    if (!flipped.ok) return;
    expect(flipped.value.dailyRefresh).toBe(true);

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    expect(fromDb.value[0].dailyRefresh).toBe(true);
  });

  it("removeBriefing deletes the row and clears the per-id status maps", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "Throwaway", prompt: "x" });
    if (!created.ok) throw new Error("create failed");

    await useBriefingStore.getState().removeBriefing(created.value.id);

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    expect(fromDb.value).toHaveLength(0);
    expect(
      useBriefingStore.getState().statusById.has(created.value.id),
    ).toBe(false);
  });

  it("refreshStaleCounts bumps count for new matching articles and persists the change", async () => {
    const created = await useBriefingStore
      .getState()
      .createBriefing({ name: "EU AI", prompt: "EU AI Act" });
    if (!created.ok) throw new Error("create failed");

    // Articles ingested AFTER the briefing's createdAt count as stale.
    // refreshStaleCounts filters with strict `>`, so the article timestamps
    // must be strictly greater than briefing.createdAt — Date.now() twice in
    // the same millisecond (common under coverage instrumentation on a fast
    // box) lands at equality and silently excludes the articles. Anchor
    // off the created briefing's stamp + a 1s offset so the comparison is
    // unambiguous regardless of clock resolution.
    const ingestAt = created.value.createdAt + 1000;
    const newArticles: Article[] = [
      {
        ...article("feed-1", 0, "EU AI Act ruling"),
        createdAt: ingestAt,
      },
      {
        ...article("feed-2", 0, "EU AI Act commission update"),
        createdAt: ingestAt,
      },
      {
        ...article("feed-3", 0, "sourdough recipes"),
        createdAt: ingestAt,
      },
    ];

    await useBriefingStore.getState().refreshStaleCounts(newArticles);

    const fromDb = await dbGetBriefings();
    if (!fromDb.ok) throw new Error("dbGetBriefings failed");
    const persisted = fromDb.value.find((b) => b.id === created.value.id);
    expect(persisted!.staleArticleCount).toBe(2);
  });
});
