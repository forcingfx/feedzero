import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  Article,
  Briefing,
  BriefingReport,
} from "@feedzero/core/types";
import { ok, err } from "../../../packages/core/src/utils/result";

// Mock the client and suggester at the module boundary. The service is
// pure orchestration; the actual LLM + network calls live behind these
// two seams, so unit-testing the service means controlling them.
const generateBriefingMock = vi.hoisted(() => vi.fn());
const resolveSuggestedFeedsMock = vi.hoisted(() => vi.fn());

vi.mock("@/core/briefings/briefing-client", () => ({
  generateBriefing: generateBriefingMock,
}));

vi.mock("@/core/briefings/feed-suggester", () => ({
  resolveSuggestedFeeds: resolveSuggestedFeedsMock,
}));

import { refreshBriefingFlow } from "@/core/briefings/briefing-service";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function article(
  feedId: string,
  daysAgo: number,
  title: string,
  id?: string,
): Article {
  return {
    id: id ?? crypto.randomUUID(),
    feedId,
    guid: crypto.randomUUID(),
    title,
    link: "https://example.com/x",
    content: "",
    summary: "",
    author: "",
    publishedAt: NOW - daysAgo * DAY,
    read: false,
    createdAt: NOW - daysAgo * DAY,
  };
}

function briefing(overrides: Partial<Briefing> = {}): Briefing {
  return {
    id: overrides.id ?? "briefing-1",
    name: overrides.name ?? "EU AI Act",
    prompt: overrides.prompt ?? "Track EU AI Act enforcement actions.",
    createdAt: overrides.createdAt ?? NOW - 7 * DAY,
    lastRunAt: overrides.lastRunAt ?? null,
    lastReport: overrides.lastReport ?? null,
    staleArticleCount: overrides.staleArticleCount ?? 0,
  };
}

function reportFromClient(overrides: Partial<BriefingReport> = {}): BriefingReport {
  return {
    schemaVersion: 1,
    abstract: "Sample abstract [A1].",
    citations: [{ articleId: "a-1", quote: "Quote." }],
    signalScore: 0, // service overrides
    suggestedFeeds: [
      {
        candidateUrl: "https://example.com/feed.xml",
        rationale: "Tracks EU rulings.",
        discoveryStatus: "pending",
      },
    ],
    matchedArticleIds: ["a-1"],
    modelId: "claude-sonnet-4-6",
    tokenUsage: { input: 100, output: 50 },
    generatedAt: NOW,
    ...overrides,
  };
}

// Build a corpus strong enough to clear BRIEFING_MIN_SCORE (10+ articles,
// 5+ feeds, recent) so the LLM gate opens.
function strongCorpus(): Article[] {
  const out: Article[] = [];
  for (let feed = 0; feed < 5; feed++) {
    for (let i = 0; i < 2; i++) {
      out.push(
        article(`feed-${feed}`, i + 1, "EU AI Act enforcement update", `id-${feed}-${i}`),
      );
    }
  }
  return out;
}

describe("refreshBriefingFlow", () => {
  beforeEach(() => {
    generateBriefingMock.mockReset();
    resolveSuggestedFeedsMock.mockReset();
    // Default the suggester to a passthrough so individual tests only
    // override when behaviour matters.
    resolveSuggestedFeedsMock.mockImplementation(async (s) => s);
  });

  it("returns no-api-key when apiKey is null (UI links to Settings)", async () => {
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: null,
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-api-key");
    expect(generateBriefingMock).not.toHaveBeenCalled();
  });

  it("returns no-articles when the corpus is empty (UI tells user to add feeds)", async () => {
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: [],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-articles");
    expect(generateBriefingMock).not.toHaveBeenCalled();
  });

  it("returns not-enough-evidence and never calls the LLM when signal score is below the gate", async () => {
    // One article on one feed → score will be well below 15.
    const result = await refreshBriefingFlow({
      briefing: briefing({ prompt: "blockchain" }),
      articles: [article("feed-1", 1, "blockchain news")],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("not-enough-evidence");
    expect(typeof result.signalScore).toBe("number");
    expect(generateBriefingMock).not.toHaveBeenCalled();
  });

  it("on success returns the briefing with lastReport, lastRunAt, and staleArticleCount reset", async () => {
    generateBriefingMock.mockResolvedValueOnce(ok(reportFromClient()));
    const before = briefing({ staleArticleCount: 7 });

    const result = await refreshBriefingFlow({
      briefing: before,
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.id).toBe(before.id);
    expect(result.briefing.lastReport).not.toBeNull();
    expect(result.briefing.lastRunAt).toBe(NOW);
    expect(result.briefing.staleArticleCount).toBe(0);
  });

  it("overrides the client's signalScore with the local matcher's score", async () => {
    // Client tries to claim signalScore: 99; service must overwrite from local.
    generateBriefingMock.mockResolvedValueOnce(
      ok(reportFromClient({ signalScore: 99 })),
    );
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.briefing.lastReport!.signalScore).not.toBe(99);
    expect(result.briefing.lastReport!.signalScore).toBeGreaterThan(0);
  });

  it("hands generateBriefing only the top-K matched articles (not the full corpus)", async () => {
    generateBriefingMock.mockResolvedValueOnce(ok(reportFromClient()));
    // Strong corpus + a bunch of irrelevant articles
    const corpus = [
      ...strongCorpus(),
      article("feed-x", 5, "knitting tutorial"),
      article("feed-x", 5, "sourdough recipes"),
    ];
    await refreshBriefingFlow({
      briefing: briefing(),
      articles: corpus,
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    const call = generateBriefingMock.mock.calls[0][0];
    const titles = call.articles.map((a: Article) => a.title);
    expect(titles).not.toContain("knitting tutorial");
    expect(titles).not.toContain("sourdough recipes");
  });

  it("resolves suggestedFeeds via the suggester after the client returns", async () => {
    generateBriefingMock.mockResolvedValueOnce(ok(reportFromClient()));
    resolveSuggestedFeedsMock.mockResolvedValueOnce([
      {
        candidateUrl: "https://example.com/feed.xml",
        rationale: "Tracks EU rulings.",
        discoveryStatus: "resolved",
        resolvedFeedUrl: "https://example.com/feed.xml",
        resolvedTitle: "Example",
      },
    ]);
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(resolveSuggestedFeedsMock).toHaveBeenCalledTimes(1);
    if (!result.ok) throw new Error("expected ok");
    expect(result.briefing.lastReport!.suggestedFeeds[0].discoveryStatus).toBe(
      "resolved",
    );
    expect(result.briefing.lastReport!.suggestedFeeds[0].resolvedTitle).toBe(
      "Example",
    );
  });

  it("forwards the AbortSignal to the client", async () => {
    generateBriefingMock.mockResolvedValueOnce(ok(reportFromClient()));
    const controller = new AbortController();
    await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      signal: controller.signal,
      now: NOW,
    });
    const call = generateBriefingMock.mock.calls[0][0];
    expect(call.signal).toBe(controller.signal);
  });

  it("returns reason:error when the client returns an err Result", async () => {
    generateBriefingMock.mockResolvedValueOnce(err("Anthropic rate limit hit."));
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
    expect(result.error.toLowerCase()).toContain("rate");
  });

  it("returns reason:error when the suggester throws (briefing already generated, so we surface the error)", async () => {
    generateBriefingMock.mockResolvedValueOnce(ok(reportFromClient()));
    resolveSuggestedFeedsMock.mockRejectedValueOnce(new Error("network kaput"));
    const result = await refreshBriefingFlow({
      briefing: briefing(),
      articles: strongCorpus(),
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("error");
  });
});
