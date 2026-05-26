/**
 * Tests for the midnight scheduler hook.
 *
 * The hook fires `runSignalMidnightTasks` once around local midnight
 * while a FeedZero tab is open. The runner:
 *   - kicks `useAISignalStore.loadReport({ force: true })` if Signal
 *     mode is "ai", nightly is on, and an Anthropic key is set;
 *   - iterates `useBriefingStore.briefings` and calls
 *     `refreshBriefing` for each whose `dailyRefresh === true`.
 *
 * Tests target the runner directly (pure-ish dispatcher) plus the
 * hook's scheduling behaviour with fake timers.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  runSignalMidnightTasks,
  useSignalMidnightRefresh,
} from "@/hooks/use-signal-midnight-refresh";
import { useSignalModeStore } from "@/lib/signal-mode-preference";
import { useAISignalStore } from "@/stores/ai-signal-store";
import { useBriefingStore } from "@/stores/briefing-store";
import { useArticleStore } from "@/stores/article-store";
import { useFeedStore } from "@/stores/feed-store";
import type { Briefing } from "@feedzero/core/types";

vi.mock("@/core/storage/secrets", () => ({
  getAnthropicKey: vi.fn(async () => ({ ok: true, value: "sk-ant-test" })),
}));

function makeBriefing(id: string, dailyRefresh: boolean): Briefing {
  return {
    id,
    name: `B-${id}`,
    prompt: "p",
    createdAt: 0,
    lastRunAt: null,
    lastReport: null,
    staleArticleCount: 0,
    dailyRefresh,
  };
}

describe("runSignalMidnightTasks", () => {
  // The fluent type narrowing on vi.spyOn().mock is messy when the
  // spied method has a typed signature; widen the binding here so the
  // tests can read .mock.calls without TS noise.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiLoadSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let refreshBriefingSpy: any;

  beforeEach(() => {
    localStorage.clear();
    useSignalModeStore.setState({ mode: "ml", hidden: false, nightly: false });
    useArticleStore.setState({ articlesByFeedId: {} });
    useFeedStore.setState({ feeds: [] });
    useBriefingStore.setState({
      briefings: [],
      isLoading: false,
      statusById: new Map(),
      errorById: new Map(),
      pendingScoreById: new Map(),
      loadingStartedAtById: new Map(),
    });

    aiLoadSpy = vi
      .spyOn(useAISignalStore.getState(), "loadReport")
      .mockResolvedValue(undefined);
    refreshBriefingSpy = vi
      .spyOn(useBriefingStore.getState(), "refreshBriefing")
      .mockResolvedValue({ ok: true } as never);
  });

  afterEach(() => {
    aiLoadSpy.mockRestore();
    refreshBriefingSpy.mockRestore();
  });

  it("no-op when nightly is off", async () => {
    useSignalModeStore.setState({ mode: "ai", nightly: false });
    await runSignalMidnightTasks();
    expect(aiLoadSpy).not.toHaveBeenCalled();
    expect(refreshBriefingSpy).not.toHaveBeenCalled();
  });

  it("does not call AI loadReport while mode is Local, even with nightly on", async () => {
    useSignalModeStore.setState({ mode: "ml", nightly: true });
    await runSignalMidnightTasks();
    expect(aiLoadSpy).not.toHaveBeenCalled();
  });

  it("calls AI loadReport with force when nightly + AI mode + key are all set", async () => {
    useSignalModeStore.setState({ mode: "ai", nightly: true });
    await runSignalMidnightTasks();
    expect(aiLoadSpy).toHaveBeenCalledWith({ force: true });
  });

  it("iterates briefings and refreshes only those with dailyRefresh === true", async () => {
    useSignalModeStore.setState({ mode: "ai", nightly: true });
    useBriefingStore.setState({
      briefings: [
        makeBriefing("a", true),
        makeBriefing("b", false),
        makeBriefing("c", true),
      ],
    });
    await runSignalMidnightTasks();
    expect(refreshBriefingSpy).toHaveBeenCalledTimes(2);
    const calledIds = refreshBriefingSpy.mock.calls.map((c: unknown[]) => c[0]);
    expect(calledIds.sort()).toEqual(["a", "c"]);
  });

  it("refreshes briefings even when AI signal mode is off, if nightly is on", async () => {
    // The user might want Local Signal mode but still keep a saved
    // briefing on a nightly schedule. Signal mode gates only the AI
    // overview run, not the per-briefing fan-out.
    useSignalModeStore.setState({ mode: "ml", nightly: true });
    useBriefingStore.setState({
      briefings: [makeBriefing("only-one", true)],
    });
    await runSignalMidnightTasks();
    expect(aiLoadSpy).not.toHaveBeenCalled();
    expect(refreshBriefingSpy).toHaveBeenCalledTimes(1);
  });

  it("a single briefing failure does not abort the chain", async () => {
    useSignalModeStore.setState({ mode: "ml", nightly: true });
    useBriefingStore.setState({
      briefings: [
        makeBriefing("a", true),
        makeBriefing("b", true),
        makeBriefing("c", true),
      ],
    });
    refreshBriefingSpy.mockImplementationOnce(async () => {
      throw new Error("boom");
    });
    await runSignalMidnightTasks();
    // 3 attempts even though the first threw.
    expect(refreshBriefingSpy).toHaveBeenCalledTimes(3);
  });
});

describe("useSignalMidnightRefresh — scheduling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    useSignalModeStore.setState({ mode: "ml", hidden: false, nightly: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not throw at mount or unmount", () => {
    const { unmount } = renderHook(() => useSignalMidnightRefresh());
    expect(() => unmount()).not.toThrow();
  });

  it("schedules the next run at local midnight, not immediately", async () => {
    // Set the clock to noon on a fixed day.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.setSystemTime(noon);

    const aiLoadSpy = vi
      .spyOn(useAISignalStore.getState(), "loadReport")
      .mockResolvedValue(undefined);
    useSignalModeStore.setState({ mode: "ai", nightly: true });

    renderHook(() => useSignalMidnightRefresh());

    // At noon → ~12h until next midnight. Nothing should fire 1h
    // before; the run lands once the clock crosses 00:00.
    await vi.advanceTimersByTimeAsync(11 * 60 * 60 * 1000);
    expect(aiLoadSpy).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000 + 1000);
    expect(aiLoadSpy).toHaveBeenCalledWith({ force: true });
    aiLoadSpy.mockRestore();
  });
});
