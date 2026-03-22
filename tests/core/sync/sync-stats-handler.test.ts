import { describe, it, expect, beforeEach } from "vitest";
import { handleSyncStatsRequest } from "@/core/sync/sync-stats-handler";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import type { SyncStorageAdapter } from "@/core/sync/types";

describe("sync-stats-handler", () => {
  let adapter: SyncStorageAdapter;

  beforeEach(() => {
    adapter = createMemoryAdapter();
  });

  it("returns zero count when no vaults exist", async () => {
    const request = new Request("http://localhost/api/stats/sync");
    const response = await handleSyncStatsRequest(request, adapter);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ ok: true, vaults: 0 });
  });

  it("returns correct count after storing vaults", async () => {
    await adapter.put("a".repeat(64), '{"ok":true}');
    await adapter.put("b".repeat(64), '{"ok":true}');

    const request = new Request("http://localhost/api/stats/sync");
    const response = await handleSyncStatsRequest(request, adapter);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toEqual({ ok: true, vaults: 2 });
  });

  it("returns updated count after deleting a vault", async () => {
    await adapter.put("a".repeat(64), '{"ok":true}');
    await adapter.put("b".repeat(64), '{"ok":true}');
    await adapter.delete("a".repeat(64));

    const request = new Request("http://localhost/api/stats/sync");
    const response = await handleSyncStatsRequest(request, adapter);

    const data = await response.json();
    expect(data.vaults).toBe(1);
  });

  it("sets CORS and security headers", async () => {
    const request = new Request("http://localhost/api/stats/sync");
    const response = await handleSyncStatsRequest(request, adapter);

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Type")).toBe("application/json");
  });

  it("returns 405 for non-GET methods", async () => {
    const request = new Request("http://localhost/api/stats/sync", {
      method: "POST",
    });
    const response = await handleSyncStatsRequest(request, adapter);
    expect(response.status).toBe(405);
  });
});
