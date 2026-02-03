import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore } from "../../src/stores/app-store.ts";

vi.mock("../../src/core/storage/db.ts", () => ({
  open: vi.fn(),
}));

import { open } from "../../src/core/storage/db.ts";

const ONBOARDING_KEY = "feedzero:onboarding-complete";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("app-store", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
    useAppStore.setState({
      isDbReady: false,
      error: null,
      hasCompletedOnboarding: false,
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it("starts with db not ready and no error", () => {
    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(false);
    expect(state.error).toBeNull();
  });

  it("initialize sets isDbReady on success", async () => {
    vi.mocked(open).mockResolvedValue({ ok: true, value: true });

    await useAppStore.getState().initialize("test-key");

    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(true);
    expect(state.error).toBeNull();
    expect(open).toHaveBeenCalledWith("test-key");
  });

  it("initialize sets error on failure", async () => {
    vi.mocked(open).mockResolvedValue({ ok: false, error: "DB failed" });

    await useAppStore.getState().initialize("test-key");

    const state = useAppStore.getState();
    expect(state.isDbReady).toBe(false);
    expect(state.error).toBe("DB failed");
  });

  it("setError updates error state", () => {
    useAppStore.getState().setError("something broke");
    expect(useAppStore.getState().error).toBe("something broke");

    useAppStore.getState().setError(null);
    expect(useAppStore.getState().error).toBeNull();
  });

  describe("onboarding completion", () => {
    it("hasCompletedOnboarding defaults to false when localStorage empty", () => {
      localStorageMock.clear();
      const state = useAppStore.getState();
      expect(state.hasCompletedOnboarding).toBe(false);
    });

    it("completeOnboarding sets flag in state", () => {
      useAppStore.getState().completeOnboarding();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });

    it("completeOnboarding persists flag to localStorage", () => {
      useAppStore.getState().completeOnboarding();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        ONBOARDING_KEY,
        "true",
      );
    });

    it("checkOnboardingStatus reads true from localStorage", () => {
      localStorageMock.setItem(ONBOARDING_KEY, "true");
      useAppStore.getState().checkOnboardingStatus();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    });

    it("checkOnboardingStatus reads false when localStorage empty", () => {
      localStorageMock.clear();
      useAppStore.setState({ hasCompletedOnboarding: true });
      useAppStore.getState().checkOnboardingStatus();
      expect(useAppStore.getState().hasCompletedOnboarding).toBe(false);
    });
  });
});
