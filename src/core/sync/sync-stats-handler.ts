import type { SyncStorageAdapter } from "./types.ts";

const API_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Returns the number of encrypted vaults stored on the server.
 * No user-identifiable information is exposed — just a count.
 */
export async function handleSyncStatsRequest(
  request: Request,
  adapter: SyncStorageAdapter,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: API_HEADERS },
    );
  }

  const countResult = await adapter.count();
  if (!countResult.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: countResult.error }),
      { status: 500, headers: API_HEADERS },
    );
  }

  // lastUpdatedAt is observability-only — a failure to resolve it must not
  // brick /api/stats-sync (which is the only REQUIRED endpoint for the
  // /stats page, per stats-page.tsx loadAll). Degrade to null on error.
  const lastResult = await adapter.lastUpdatedAt();
  const lastUpdatedAt = lastResult.ok ? lastResult.value : null;

  return new Response(
    JSON.stringify({ ok: true, vaults: countResult.value, lastUpdatedAt }),
    { status: 200, headers: API_HEADERS },
  );
}
