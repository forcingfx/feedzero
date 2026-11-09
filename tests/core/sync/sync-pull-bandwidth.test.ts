import { describe, it, expect, beforeEach } from "vitest";
import { handleSyncRequest } from "@/core/sync/sync-handler";
import {
  UpstashSyncAdapter,
  type UpstashSyncClient,
} from "@/core/sync/adapters/upstash-adapter";

/**
 * Upstash bills bandwidth on every byte a command returns, and the free
 * plan caps it at 10 GB a month. Before this, an unchanged pull still
 * read the whole vault (up to 8 MiB) just to hash it into an ETag, and
 * every device pulls at boot and on each 30-minute refresh — that alone
 * used 8 GB of the October quota. These tests pin the cheap path: the
 * real handler over the real adapter, with only the Upstash client faked
 * and every key it reads recorded.
 */
function recordingClient(): UpstashSyncClient & {
  store: Map<string, string>;
  reads: string[];
} {
  const store = new Map<string, string>();
  const reads: string[] = [];
  return {
    store,
    reads,
    async get<T = string>(key: string): Promise<T | null> {
      reads.push(key);
      return store.has(key) ? (store.get(key) as T) : null;
    },
    async set(key, value) {
      store.set(key, String(value));
      return "OK";
    },
    async mset(entries) {
      for (const [key, value] of Object.entries(entries)) {
        store.set(key, String(value));
      }
      return "OK";
    },
    async del(key) {
      const had = store.delete(key);
      return had ? 1 : 0;
    },
    async scan() {
      return [0, []];
    },
  };
}

const VAULT_ID = "1a2b".repeat(16);
const VAULT_KEY = `vault:${VAULT_ID}`;

function put(vault: unknown): Request {
  return new Request("http://localhost/api/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vaultId: VAULT_ID, vault }),
  });
}

function get(method: "GET" | "HEAD", ifNoneMatch?: string): Request {
  return new Request(`http://localhost/api/sync?vaultId=${VAULT_ID}`, {
    method,
    headers: ifNoneMatch ? { "If-None-Match": ifNoneMatch } : {},
  });
}

describe("sync pull bandwidth on Upstash", () => {
  let client: ReturnType<typeof recordingClient>;
  let adapter: UpstashSyncAdapter;

  beforeEach(() => {
    client = recordingClient();
    adapter = new UpstashSyncAdapter(client);
  });

  it("answers an unchanged pull with 304 without reading the vault", async () => {
    const pushed = await handleSyncRequest(put({ v: "one" }), adapter);
    const etag = pushed.headers.get("ETag")!;

    const pulled = await handleSyncRequest(get("GET", etag), adapter);

    expect(pulled.status).toBe(304);
    expect(pulled.headers.get("ETag")).toBe(etag);
    expect(client.reads).not.toContain(VAULT_KEY);
  });

  it("still returns the new vault when the device's ETag is stale", async () => {
    const first = await handleSyncRequest(put({ v: "one" }), adapter);
    const stale = first.headers.get("ETag")!;
    await handleSyncRequest(put({ v: "two" }), adapter);

    const pulled = await handleSyncRequest(get("GET", stale), adapter);

    expect(pulled.status).toBe(200);
    expect(await pulled.text()).toContain('"two"');
    expect(pulled.headers.get("ETag")).not.toBe(stale);
  });

  it("answers HEAD for a pushed vault without reading the vault", async () => {
    await handleSyncRequest(put({ v: "one" }), adapter);

    const head = await handleSyncRequest(get("HEAD"), adapter);

    expect(head.status).toBe(200);
    expect(client.reads).not.toContain(VAULT_KEY);
  });

  // Vaults pushed before the ETag key existed have none. They must keep
  // working through the full read until their next push writes one.
  it("falls back to a full read for a vault stored without an ETag", async () => {
    client.store.set(VAULT_KEY, JSON.stringify({ ok: true, vault: { v: "old" } }));

    const pulled = await handleSyncRequest(get("GET", 'W/"0000000000000000"'), adapter);

    expect(pulled.status).toBe(200);
    expect(await pulled.text()).toContain('"old"');
  });

  it("removes the stored ETag with the vault", async () => {
    await handleSyncRequest(put({ v: "one" }), adapter);
    const etag = (await handleSyncRequest(get("GET"), adapter)).headers.get("ETag")!;

    await adapter.delete(VAULT_ID);
    const pulled = await handleSyncRequest(get("GET", etag), adapter);

    expect(pulled.status).toBe(404);
  });
});
