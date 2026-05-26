import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAISignalStore } from "@/stores/ai-signal-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";

// The AI store's loadReport calls into the secrets layer (for the
// Anthropic key) and the relay client. The in-flight guard must
// short-circuit BEFORE any of those, so mocking them as throwing is a
// clean way to assert "the guard returned early before reaching the
// network." Same shape for getBriefingModelPreference.
vi.mock("@/core/storage/secrets", () => ({
  getAnthropicKey: vi.fn(() => {
    throw new Error("AI store reached the secrets layer despite the in-flight guard");
  }),
}));
vi.mock("@/core/signal/ai-overview-client", () => ({
  generateAIOverview: vi.fn(() => {
    throw new Error("AI store reached the relay despite the in-flight guard");
  }),
}));

describe("ai-signal-store — in-flight guard", () => {
  beforeEach(() => {
    localStorage.clear();
    useAISignalStore.setState({
      status: "idle",
      report: null,
      corpusSize: 0,
      error: null,
      loadingStartedAt: null,
    });
    useFeedStore.setState({ feeds: [] });
    useArticleStore.setState({ articlesByFeedId: {} });
  });

  it("a non-force loadReport while status is 'loading' is a no-op", async () => {
    useAISignalStore.setState({ status: "loading", loadingStartedAt: Date.now() });
    const before = useAISignalStore.getState();

    // No throw means the guard returned early before touching secrets /
    // the relay (both throw on call in this file's mocks).
    await useAISignalStore.getState().loadReport();

    const after = useAISignalStore.getState();
    expect(after.status).toBe(before.status);
    expect(after.report).toBe(before.report);
    expect(after.loadingStartedAt).toBe(before.loadingStartedAt);
  });
});
