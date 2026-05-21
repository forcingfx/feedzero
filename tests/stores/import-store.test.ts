import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  useImportStore,
  selectTotalCount,
  selectSuccessCount,
  selectPlaceholderCount,
  selectFailureCount,
  selectCurrentUrl,
} from "../../src/stores/import-store.ts";

// Mock the feed store
vi.mock("../../src/stores/feed-store.ts", () => ({
  useFeedStore: {
    getState: () => ({
      addFeed: vi.fn(),
    }),
  },
}));

describe("import-store", () => {
  beforeEach(() => {
    // Reset store state before each test
    useImportStore.setState({
      status: "idle",
      urls: [],
      currentIndex: 0,
      results: [],
      error: null,
    });
  });

  describe("initial state", () => {
    it("should start with idle status", () => {
      const state = useImportStore.getState();
      expect(state.status).toBe("idle");
      expect(state.urls).toEqual([]);
      expect(state.currentIndex).toBe(0);
      expect(state.results).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe("startImport", () => {
    it("should transition to importing status with URLs", () => {
      const urls = ["https://a.com/feed", "https://b.com/feed"];
      useImportStore.getState().startImport(urls);

      const state = useImportStore.getState();
      expect(state.status).toBe("importing");
      expect(state.urls).toEqual(urls);
      expect(state.currentIndex).toBe(0);
      expect(state.results).toEqual([]);
    });

    it("should set error for empty URL list", () => {
      useImportStore.getState().startImport([]);

      const state = useImportStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("No URLs to import");
    });
  });

  describe("recordResult", () => {
    it("should record successful import result", () => {
      useImportStore.getState().startImport(["https://a.com/feed"]);
      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });

      const state = useImportStore.getState();
      expect(state.results).toHaveLength(1);
      expect(state.results[0]).toEqual({
        url: "https://a.com/feed",
        success: true,
      });
      expect(state.currentIndex).toBe(1);
    });

    it("should record failed import result with error", () => {
      useImportStore.getState().startImport(["https://a.com/feed"]);
      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: false,
        error: "Failed to fetch feed",
      });

      const state = useImportStore.getState();
      expect(state.results).toHaveLength(1);
      expect(state.results[0]).toEqual({
        url: "https://a.com/feed",
        success: false,
        error: "Failed to fetch feed",
      });
    });

    it("should transition to complete when all URLs processed", () => {
      useImportStore
        .getState()
        .startImport(["https://a.com/feed", "https://b.com/feed"]);

      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });
      expect(useImportStore.getState().status).toBe("importing");

      useImportStore.getState().recordResult({
        url: "https://b.com/feed",
        success: true,
      });
      expect(useImportStore.getState().status).toBe("complete");
    });
  });

  describe("setError", () => {
    it("should set error state", () => {
      useImportStore.getState().setError("Something went wrong");

      const state = useImportStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Something went wrong");
    });
  });

  describe("reset", () => {
    it("should reset to initial state", () => {
      // First, set up some state
      useImportStore.getState().startImport(["https://a.com/feed"]);
      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });

      // Now reset
      useImportStore.getState().reset();

      const state = useImportStore.getState();
      expect(state.status).toBe("idle");
      expect(state.urls).toEqual([]);
      expect(state.currentIndex).toBe(0);
      expect(state.results).toEqual([]);
      expect(state.error).toBeNull();
    });
  });

  describe("selectors", () => {
    it("should calculate totalCount correctly", () => {
      useImportStore
        .getState()
        .startImport([
          "https://a.com/feed",
          "https://b.com/feed",
          "https://c.com/feed",
        ]);

      expect(selectTotalCount(useImportStore.getState())).toBe(3);
    });

    it("should calculate successCount correctly", () => {
      useImportStore
        .getState()
        .startImport([
          "https://a.com/feed",
          "https://b.com/feed",
          "https://c.com/feed",
        ]);

      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });
      useImportStore.getState().recordResult({
        url: "https://b.com/feed",
        success: false,
        error: "Failed",
      });
      useImportStore.getState().recordResult({
        url: "https://c.com/feed",
        success: true,
      });

      expect(selectSuccessCount(useImportStore.getState())).toBe(2);
    });

    it("should calculate failureCount correctly", () => {
      useImportStore
        .getState()
        .startImport([
          "https://a.com/feed",
          "https://b.com/feed",
          "https://c.com/feed",
        ]);

      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });
      useImportStore.getState().recordResult({
        url: "https://b.com/feed",
        success: false,
        error: "Failed",
      });
      useImportStore.getState().recordResult({
        url: "https://c.com/feed",
        success: false,
        error: "Also failed",
      });

      expect(selectFailureCount(useImportStore.getState())).toBe(2);
    });

    it("should return current URL being processed", () => {
      useImportStore
        .getState()
        .startImport(["https://a.com/feed", "https://b.com/feed"]);

      expect(selectCurrentUrl(useImportStore.getState())).toBe(
        "https://a.com/feed",
      );

      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });

      expect(selectCurrentUrl(useImportStore.getState())).toBe(
        "https://b.com/feed",
      );
    });

    it("should return null for currentUrl when complete", () => {
      useImportStore.getState().startImport(["https://a.com/feed"]);
      useImportStore.getState().recordResult({
        url: "https://a.com/feed",
        success: true,
      });

      expect(selectCurrentUrl(useImportStore.getState())).toBeNull();
    });

    it("counts placeholder results separately from fully-imported successes", () => {
      // Three buckets: full-success (green), placeholder (amber — queued
      // for retry on next refresh), and failure (red — rejected).
      useImportStore.getState().startImport([
        "https://a.com/feed",
        "https://b.com/feed",
        "https://c.com/feed",
        "https://d.com/feed",
      ]);
      useImportStore
        .getState()
        .recordResult({ url: "https://a.com/feed", success: true });
      useImportStore.getState().recordResult({
        url: "https://b.com/feed",
        success: true,
        placeholder: true,
      });
      useImportStore.getState().recordResult({
        url: "https://c.com/feed",
        success: true,
        placeholder: true,
      });
      useImportStore.getState().recordResult({
        url: "https://d.com/feed",
        success: false,
        error: "not a feed",
      });

      const state = useImportStore.getState();
      expect(selectSuccessCount(state)).toBe(1);
      expect(selectPlaceholderCount(state)).toBe(2);
      expect(selectFailureCount(state)).toBe(1);
    });
  });
});
