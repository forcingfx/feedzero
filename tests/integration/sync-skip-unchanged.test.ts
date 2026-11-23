/**
 * A routine refresh must not re-upload a vault nothing meaningful changed
 * in. Every upload carries fresh random padding, so it also forces the
 * user's other devices to download the whole vault again: this pair of
 * costs exhausted the Upstash bandwidth quota on 2026-11-23.
 *
 * Only the network is faked. The store, sync service, crypto, db and the
 * real /api/sync handler (over a memory adapter) all run for real.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.setConfig({ testTimeout: 30_000 });

import { useSyncStore } from "../../src/stores/sync-store.ts";
import {
  close,
  deleteDatabase,
  addFeed,
  addArticles,
  getFeeds,
  getAllArticles,
  updateArticle,
} from "../../src/core/storage/db.ts";
import { initFresh } from "../../src/core/storage/key-manager.ts";
import { refreshFeed } from "../../src/core/feeds/feed-service.ts";
import { pushVault } from "../../src/core/sync/sync-service.ts";
import { handleSyncRequest } from "../../src/core/sync/sync-handler.ts";
import { createMemoryAdapter } from "../../src/core/sync/adapters/memory-adapter.ts";
import { clearLicenseToken } from "../../src/core/license/license-token-store.ts";
import { LOCAL_STORAGE } from "@feedzero/core/utils/constants";
import type { SyncStorageAdapter } from "../../src/core/sync/types.ts";
import type { Article, Feed } from "@feedzero/core/types";

const PASSPHRASE = "skip-unchanged-test-passphrase";

const feed: Feed = {
  id: "feed-1",
  url: "https://example.com/feed.xml",
  title: "Example",
  description: "",
  siteUrl: "https://example.com",
  createdAt: 1,
  updatedAt: 1,
};

const article: Article = {
  id: "article-1",
  feedId: "feed-1",
  guid: "guid-1",
  title: "Post",
  link: "https://example.com/post",
  content: "",
  summary: "",
  author: "",
  publishedAt: 1,
  read: false,
  createdAt: 1,
};

let adapter: SyncStorageAdapter;
let uploads: number;

function fakeNetwork() {
  return vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    if (url.startsWith("/api/feed")) {
      return new Response(null, { status: 304 });
    }
    if (url.startsWith("/api/sync")) {
      if (init.method === "PUT") uploads += 1;
      return handleSyncRequest(
        new Request(new URL(url, "http://localhost"), init),
        adapter,
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

async function resetEverything() {
  close();
  await deleteDatabase();
  localStorage.removeItem(LOCAL_STORAGE.DERIVED_KEYS);
  localStorage.removeItem(LOCAL_STORAGE.STORAGE_MODE);
  localStorage.removeItem(LOCAL_STORAGE.SYNC_PENDING_PUSH);
  clearLicenseToken();
  useSyncStore.setState({
    status: "local-only",
    lastSyncedAt: null,
    error: null,
    credentials: null,
    lastVaultEtag: null,
  });
}

async function setRead(read: boolean) {
  const stored = await getAllArticles();
  if (!stored.ok) throw new Error(stored.error);
  await updateArticle({ ...stored.value[0], read });
}

async function routineRefresh() {
  const feeds = await getFeeds();
  if (!feeds.ok) throw new Error(feeds.error);
  await refreshFeed(feeds.value[0]);
}

describe("skipping unchanged vault uploads", () => {
  beforeEach(async () => {
    await resetEverything();
    adapter = createMemoryAdapter();
    uploads = 0;
    vi.stubGlobal("fetch", fakeNetwork());
    const init = await initFresh(PASSPHRASE, { sync: false });
    if (!init.ok) throw new Error(init.error);
    await addFeed(feed);
    await addArticles([article]);
    await useSyncStore.getState().enableSync(PASSPHRASE);
    expect(uploads).toBe(1);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await resetEverything();
  });

  it("does not upload after a refresh that found nothing new", async () => {
    await routineRefresh();
    await useSyncStore.getState().push();

    expect(uploads).toBe(1);
    expect(useSyncStore.getState().status).toBe("synced");
  });

  it("clears the pending marker when it skips, so a reload does not re-upload", async () => {
    localStorage.setItem(LOCAL_STORAGE.SYNC_PENDING_PUSH, "1");
    await useSyncStore.getState().push();

    expect(localStorage.getItem(LOCAL_STORAGE.SYNC_PENDING_PUSH)).toBeNull();
  });

  it("uploads when the user changed something", async () => {
    await setRead(true);
    await useSyncStore.getState().push();

    expect(uploads).toBe(2);
  });

  it("does not re-upload a vault it just downloaded", async () => {
    useSyncStore.setState({ lastVaultEtag: null });
    await useSyncStore.getState().pull();
    await useSyncStore.getState().push();

    expect(uploads).toBe(1);
  });

  it("still uploads a change that restores what this device last pushed", async () => {
    // Another device marks the article read and uploads.
    const credentials = useSyncStore.getState().credentials!;
    await setRead(true);
    await pushVault(credentials);
    expect(uploads).toBe(2);

    // This device pulls that change, then the user marks it unread again:
    // the content now equals this device's first push but not the server.
    await useSyncStore.getState().pull();
    await setRead(false);
    await useSyncStore.getState().push();

    expect(uploads).toBe(3);
  });

  it("re-uploads when the cloud vault has disappeared", async () => {
    const { credentials } = useSyncStore.getState();
    await adapter.delete(credentials!.vaultId);
    useSyncStore.setState({ lastVaultEtag: null });

    await useSyncStore.getState().pull();
    await useSyncStore.getState().push();

    expect(uploads).toBe(2);
    expect((await adapter.get(credentials!.vaultId)).ok).toBe(true);
  });

  it("re-uploads after the user deletes the cloud vault", async () => {
    const { credentials } = useSyncStore.getState();
    await useSyncStore.getState().deleteCloudVault();
    await useSyncStore.getState().push();

    expect(uploads).toBe(2);
    const stored = await adapter.get(credentials!.vaultId);
    expect(stored.ok && stored.value).toBeTruthy();
  });

  it("forgets the synced state when sync is switched off", async () => {
    await useSyncStore.getState().disableSync();
    await useSyncStore.getState().enableSync(PASSPHRASE);

    expect(uploads).toBe(2);
  });
});
