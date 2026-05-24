/**
 * Sync round-trip for Signal Briefings + the Anthropic key secret.
 *
 * Verifies that briefings and secrets ride through the encrypted vault
 * just like every other user row — exportAll → exportVault → importVault
 * → importAll → getBriefings / getSecret produces the same data on
 * device B that device A wrote.
 *
 * Mock-at-the-boundary: only the network (sync push/pull) is implicit
 * by us calling import/export directly. Everything else runs for real
 * against fake-indexeddb, including encryption.
 */

import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  open,
  close,
  deleteDatabase,
  addBriefing,
  getBriefings,
  getSecret,
} from "../../../src/core/storage/db";
import {
  setAnthropicKey,
  getAnthropicKey,
} from "../../../src/core/storage/secrets";
import {
  exportVault,
  importVault,
  mergeVaults,
} from "../../../src/core/sync/sync-service";
import type { Briefing, BriefingReport } from "@feedzero/core/types";

function makeBriefing(
  id: string,
  name: string,
  staleArticleCount = 0,
  report: BriefingReport | null = null,
): Briefing {
  return {
    id,
    name,
    prompt: `Prompt for ${name}`,
    createdAt: Date.now(),
    lastRunAt: report ? Date.now() : null,
    lastReport: report,
    staleArticleCount,
  };
}

describe("vault round-trip — briefings + anthropic key", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);
  });

  afterEach(() => {
    close();
  });

  it("exportVault carries briefings + anthropic secret", async () => {
    await addBriefing(makeBriefing("b1", "EU AI Act"));
    await setAnthropicKey("sk-ant-roundtrip");

    const vault = await exportVault();
    expect(vault.ok).toBe(true);
    if (!vault.ok) return;
    expect(vault.value.briefings).toHaveLength(1);
    expect(vault.value.briefings![0].name).toBe("EU AI Act");
    expect(vault.value.secrets?.anthropicKey).toBe("sk-ant-roundtrip");
  });

  it("importVault writes briefings + secret on a fresh device", async () => {
    // Device A: write + export
    await addBriefing(makeBriefing("b1", "EU AI Act"));
    await setAnthropicKey("sk-ant-roundtrip");
    const exported = await exportVault();
    if (!exported.ok) throw new Error("export failed");

    // Simulate device B: nuke + reopen + import the same vault
    close();
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);

    const imported = await importVault(exported.value);
    expect(imported.ok).toBe(true);

    const briefings = await getBriefings();
    expect(briefings.ok).toBe(true);
    if (!briefings.ok) return;
    expect(briefings.value).toHaveLength(1);
    expect(briefings.value[0].name).toBe("EU AI Act");

    const key = await getAnthropicKey();
    expect(key.ok).toBe(true);
    if (!key.ok) return;
    expect(key.value).toBe("sk-ant-roundtrip");
  });

  it("preserves a full BriefingReport across the round-trip", async () => {
    const report: BriefingReport = {
      schemaVersion: 1,
      abstract: "Sample abstract [A1].",
      citations: [{ articleId: "a-1", quote: "Quote." }],
      signalScore: 60,
      suggestedFeeds: [
        {
          candidateUrl: "https://example.com/feed.xml",
          rationale: "Strengthens coverage.",
          discoveryStatus: "resolved",
          resolvedFeedUrl: "https://example.com/feed.xml",
          resolvedTitle: "Example",
        },
      ],
      matchedArticleIds: ["a-1"],
      modelId: "claude-sonnet-4-6",
      tokenUsage: { input: 100, output: 50 },
      generatedAt: Date.now(),
    };
    await addBriefing(makeBriefing("b1", "With report", 2, report));

    const exported = await exportVault();
    if (!exported.ok) throw new Error("export failed");

    close();
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);
    await importVault(exported.value);

    const briefings = await getBriefings();
    if (!briefings.ok) throw new Error("getBriefings failed");
    expect(briefings.value[0].lastReport).toEqual(report);
    expect(briefings.value[0].staleArticleCount).toBe(2);
  });

  it("a vault without briefings or secrets does not wipe local rows (back-compat)", async () => {
    // Device A: has briefings + key locally.
    await addBriefing(makeBriefing("b1", "EU AI Act"));
    await setAnthropicKey("sk-ant-keep-me");

    // Simulate importing a pre-v4 vault from an older client (omits
    // briefings + secrets entirely).
    const oldVault = {
      version: 3,
      exportedAt: Date.now(),
      feeds: [],
      articles: [],
    };
    const imported = await importVault(oldVault);
    expect(imported.ok).toBe(true);

    const briefings = await getBriefings();
    if (!briefings.ok) throw new Error("getBriefings failed");
    expect(briefings.value).toHaveLength(1);

    const secret = await getSecret("anthropic-api-key");
    if (!secret.ok) throw new Error("getSecret failed");
    expect(secret.value).toBe("sk-ant-keep-me");
  });
});

describe("mergeVaults — briefings + secrets", () => {
  const baseFeed = {
    id: "f1",
    url: "https://x.com/feed",
    title: "X",
    description: "",
    siteUrl: "https://x.com",
    createdAt: 0,
    updatedAt: 0,
  };
  const baseVault = {
    version: 4,
    exportedAt: 0,
    feeds: [baseFeed],
    articles: [],
  };

  it("merges briefings by id with local winning on collision", () => {
    const local = {
      ...baseVault,
      briefings: [makeBriefing("b1", "Local name", 0)],
    };
    const cloud = {
      ...baseVault,
      briefings: [
        makeBriefing("b1", "Cloud name", 5), // collision — local wins
        makeBriefing("b2", "Cloud only", 0), // new from cloud
      ],
    };
    const merged = mergeVaults(local, cloud);
    expect(merged.ok).toBe(true);
    if (!merged.ok) return;
    expect(merged.value.briefings).toHaveLength(2);
    const b1 = merged.value.briefings!.find((b) => b.id === "b1");
    expect(b1?.name).toBe("Local name");
    expect(merged.value.briefings!.find((b) => b.id === "b2")).toBeDefined();
  });

  it("takes the anthropic key from whichever side has one (local wins on collision)", () => {
    const localOnly = {
      ...baseVault,
      secrets: { anthropicKey: "sk-ant-local" },
    };
    const cloudOnly = {
      ...baseVault,
      secrets: { anthropicKey: "sk-ant-cloud" },
    };
    const noKey = { ...baseVault };

    // Local has, cloud doesn't → local wins.
    let merged = mergeVaults(localOnly, noKey);
    expect(merged.ok).toBe(true);
    if (merged.ok)
      expect(merged.value.secrets?.anthropicKey).toBe("sk-ant-local");

    // Cloud has, local doesn't → cloud propagates (so new device picks up the key).
    merged = mergeVaults(noKey, cloudOnly);
    expect(merged.ok).toBe(true);
    if (merged.ok)
      expect(merged.value.secrets?.anthropicKey).toBe("sk-ant-cloud");

    // Both have different → local wins.
    merged = mergeVaults(localOnly, cloudOnly);
    expect(merged.ok).toBe(true);
    if (merged.ok)
      expect(merged.value.secrets?.anthropicKey).toBe("sk-ant-local");
  });
});
