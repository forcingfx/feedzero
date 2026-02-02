import { describe, it, expect, beforeEach } from "vitest";
import { useSyncStore } from "../../src/stores/sync-store";

describe("sync-store", () => {
  beforeEach(() => {
    useSyncStore.setState({
      status: "local-only",
      lastSyncedAt: null,
      error: null,
      passphrase: null,
      dialogOpen: false,
    });
  });

  it("starts with local-only status", () => {
    const state = useSyncStore.getState();
    expect(state.status).toBe("local-only");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.passphrase).toBeNull();
  });

  it("setSyncing transitions to syncing status", () => {
    useSyncStore.getState().setSyncing();
    expect(useSyncStore.getState().status).toBe("syncing");
  });

  it("setSynced transitions to synced with timestamp", () => {
    const now = Date.now();
    useSyncStore.getState().setSynced(now);
    const state = useSyncStore.getState();
    expect(state.status).toBe("synced");
    expect(state.lastSyncedAt).toBe(now);
    expect(state.error).toBeNull();
  });

  it("setSyncError transitions to error with message", () => {
    useSyncStore.getState().setSyncError("Network failed");
    const state = useSyncStore.getState();
    expect(state.status).toBe("error");
    expect(state.error).toBe("Network failed");
  });

  it("enableSync stores passphrase and sets syncing", () => {
    useSyncStore.getState().enableSync("carbon mango velvet prism");
    const state = useSyncStore.getState();
    expect(state.passphrase).toBe("carbon mango velvet prism");
    expect(state.status).toBe("syncing");
  });

  it("disableSync resets to local-only", () => {
    useSyncStore.getState().enableSync("carbon mango velvet prism");
    useSyncStore.getState().setSynced(Date.now());
    useSyncStore.getState().disableSync();
    const state = useSyncStore.getState();
    expect(state.status).toBe("local-only");
    expect(state.lastSyncedAt).toBeNull();
    expect(state.error).toBeNull();
    expect(state.passphrase).toBeNull();
  });
});
