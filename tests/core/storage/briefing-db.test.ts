import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
  addBriefing,
  getBriefings,
  updateBriefing,
  removeBriefing,
} from "../../../src/core/storage/db.ts";
import { createBriefing } from "../../../src/core/storage/schema.ts";
import type {
  Briefing,
  BriefingReport,
} from "../../../packages/core/src/types";

function buildBriefing(overrides: Partial<Briefing> = {}): Briefing {
  const created = createBriefing({
    name: overrides.name ?? "Test briefing",
    prompt: overrides.prompt ?? "Sample prompt.",
  });
  if (!created.ok) throw new Error("createBriefing failed in test setup");
  return { ...created.value, ...overrides };
}

describe("briefings Dexie table (encrypted CRUD)", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);
  });

  afterEach(() => {
    close();
  });

  it("addBriefing persists and getBriefings returns the decrypted row", async () => {
    const b = buildBriefing({ name: "EU AI Act" });

    const added = await addBriefing(b);
    expect(added.ok).toBe(true);

    const fetched = await getBriefings();
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toHaveLength(1);
    expect(fetched.value[0].name).toBe("EU AI Act");
    expect(fetched.value[0].id).toBe(b.id);
  });

  it("preserves a full BriefingReport across encrypt/decrypt", async () => {
    const report: BriefingReport = {
      schemaVersion: 1,
      abstract: "## Summary\n\nKey developments in EU AI policy [A1].",
      citations: [
        { articleId: "article-1", quote: "Commission opened an inquiry." },
      ],
      signalScore: 72,
      suggestedFeeds: [
        {
          candidateUrl: "https://example.com/feed.xml",
          rationale: "Tracks EU regulatory rulings weekly.",
          discoveryStatus: "resolved",
          resolvedFeedUrl: "https://example.com/feed.xml",
          resolvedTitle: "Example EU Watch",
        },
      ],
      matchedArticleIds: ["article-1", "article-2", "article-3"],
      modelId: "claude-sonnet-4-6",
      tokenUsage: { input: 1024, output: 320 },
      generatedAt: Date.now(),
    };
    const b = buildBriefing({
      name: "With report",
      lastRunAt: Date.now(),
      lastReport: report,
      staleArticleCount: 0,
    });

    await addBriefing(b);
    const fetched = await getBriefings();
    if (!fetched.ok) throw new Error("getBriefings failed");

    expect(fetched.value[0].lastReport).toEqual(report);
  });

  it("updateBriefing replaces the existing row", async () => {
    const b = buildBriefing({ name: "Original" });
    await addBriefing(b);

    await updateBriefing({ ...b, name: "Renamed", staleArticleCount: 5 });

    const fetched = await getBriefings();
    if (!fetched.ok) throw new Error("getBriefings failed");
    expect(fetched.value).toHaveLength(1);
    expect(fetched.value[0].name).toBe("Renamed");
    expect(fetched.value[0].staleArticleCount).toBe(5);
  });

  it("removeBriefing deletes the row", async () => {
    const b = buildBriefing();
    await addBriefing(b);

    const removed = await removeBriefing(b.id);
    expect(removed.ok).toBe(true);

    const fetched = await getBriefings();
    if (!fetched.ok) throw new Error("getBriefings failed");
    expect(fetched.value).toHaveLength(0);
  });

  it("returns an empty array when no briefings exist (does not error)", async () => {
    const fetched = await getBriefings();
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toEqual([]);
  });
});
