import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

import {
  pushVault,
  pullVault,
  importVault,
} from "../../src/core/sync/sync-service";

const mockPushVault = vi.mocked(pushVault);
const mockPullVault = vi.mocked(pullVault);
const mockImportVault = vi.mocked(importVault);

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

describe("sync-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorageMock.clear();
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      passphrase: null,
      dialogOpen: false,
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with local-only status", () => {
    const state = useSyncStore.getState();
    expect(state.status).toBe("local-only");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.passphrase).toBeNull();
  });

  it("setDialogOpen toggles dialog state", () => {
    useSyncStore.getState().setDialogOpen(true);
    expect(useSyncStore.getState().dialogOpen).toBe(true);
    useSyncStore.getState().setDialogOpen(false);
    expect(useSyncStore.getState().dialogOpen).toBe(false);
  });

  describe("enableSync", () => {
    it("transitions local-only → syncing → synced on success", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });

      const promise = useSyncStore.getState().enableSync("test passphrase");

      expect(useSyncStore.getState().status).toBe("syncing");
      expect(useSyncStore.getState().passphrase).toBe("test passphrase");

      await promise;

      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBe(timestamp);
      expect(state.error).toBeNull();
    });

    it("persists passphrase and storage mode to localStorage", async () => {
      mockPushVault.mockResolvedValue({ ok: true, value: Date.now() });

      await useSyncStore.getState().enableSync("test passphrase");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:sync-passphrase",
        "test passphrase",
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
        "sync",
      );
    });

    it("transitions to error on push failure", async () => {
      mockPushVault.mockResolvedValue({ ok: false, error: "Network failed" });

      await useSyncStore.getState().enableSync("test passphrase");

      const state = useSyncStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toBe("Network failed");
    });
  });

  describe("push", () => {
    it("pushes vault and updates timestamp on success", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });
      useSyncStore.setState({
        status: "synced",
        passphrase: "test passphrase",
      });

      await useSyncStore.getState().push();

      expect(mockPushVault).toHaveBeenCalledWith("test passphrase");
      const state = useSyncStore.getState();
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBe(timestamp);
    });

    it("transitions to error on push failure", async () => {
      mockPushVault.mockResolvedValue({ ok: false, error: "Server down" });
      useSyncStore.setState({
        status: "synced",
        passphrase: "test passphrase",
      });

      await useSyncStore.getState().push();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Server down");
    });

    it("does nothing when no passphrase is set", async () => {
      useSyncStore.setState({ status: "local-only", passphrase: null });

      await useSyncStore.getState().push();

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("pull", () => {
    it("pulls vault, imports data, and transitions to synced", async () => {
      const vaultData = {
        version: 1,
        exportedAt: Date.now(),
        feeds: [],
        articles: [],
      };
      mockPullVault.mockResolvedValue({ ok: true, value: vaultData });
      mockImportVault.mockResolvedValue({ ok: true, value: true });
      useSyncStore.setState({ passphrase: "test passphrase" });

      await useSyncStore.getState().pull();

      expect(mockPullVault).toHaveBeenCalledWith("test passphrase");
      expect(mockImportVault).toHaveBeenCalledWith(vaultData);
      expect(useSyncStore.getState().status).toBe("synced");
    });

    it("transitions to error on pull failure", async () => {
      mockPullVault.mockResolvedValue({ ok: false, error: "Not found" });
      useSyncStore.setState({ passphrase: "test passphrase" });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Not found");
    });

    it("transitions to error on import failure", async () => {
      mockPullVault.mockResolvedValue({
        ok: true,
        value: {
          version: 1,
          exportedAt: Date.now(),
          feeds: [],
          articles: [],
        },
      });
      mockImportVault.mockResolvedValue({ ok: false, error: "Import failed" });
      useSyncStore.setState({ passphrase: "test passphrase" });

      await useSyncStore.getState().pull();

      expect(useSyncStore.getState().status).toBe("error");
      expect(useSyncStore.getState().error).toBe("Import failed");
    });

    it("does nothing when no passphrase is set", async () => {
      useSyncStore.setState({ status: "local-only", passphrase: null });

      await useSyncStore.getState().pull();

      expect(mockPullVault).not.toHaveBeenCalled();
    });
  });

  describe("scheduleSyncPush", () => {
    it("debounces multiple rapid calls into a single push", async () => {
      const timestamp = 1700000000000;
      mockPushVault.mockResolvedValue({ ok: true, value: timestamp });
      useSyncStore.setState({
        status: "synced",
        passphrase: "test passphrase",
      });

      useSyncStore.getState().scheduleSyncPush();
      useSyncStore.getState().scheduleSyncPush();
      useSyncStore.getState().scheduleSyncPush();

      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPushVault).toHaveBeenCalledTimes(1);
    });

    it("does not push when status is local-only", async () => {
      useSyncStore.setState({ status: "local-only", passphrase: null });

      useSyncStore.getState().scheduleSyncPush();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockPushVault).not.toHaveBeenCalled();
    });
  });

  describe("restoreSync", () => {
    it("sets passphrase and status without pushing to server", () => {
      useSyncStore.getState().restoreSync("restored passphrase");

      const state = useSyncStore.getState();
      expect(state.passphrase).toBe("restored passphrase");
      expect(state.status).toBe("synced");
      expect(state.lastSyncedAt).toBeTypeOf("number");
      expect(state.error).toBeNull();
      expect(mockPushVault).not.toHaveBeenCalled();
    });

    it("persists passphrase and storage mode to localStorage", () => {
      useSyncStore.getState().restoreSync("restored passphrase");

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:sync-passphrase",
        "restored passphrase",
      );
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
        "sync",
      );
    });
  });

  describe("disableSync", () => {
    it("resets state and clears localStorage", () => {
      localStorageMock.setItem("feedzero:sync-passphrase", "test");
      localStorageMock.setItem("feedzero:storage-mode", "sync");
      useSyncStore.setState({
        status: "synced",
        passphrase: "test",
        lastSyncedAt: Date.now(),
      });

      useSyncStore.getState().disableSync();

      const state = useSyncStore.getState();
      expect(state.status).toBe("local-only");
      expect(state.passphrase).toBeNull();
      expect(state.lastSyncedAt).toBeNull();
      expect(state.error).toBeNull();
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:sync-passphrase",
      );
      expect(localStorageMock.removeItem).toHaveBeenCalledWith(
        "feedzero:storage-mode",
      );
    });
  });
});
