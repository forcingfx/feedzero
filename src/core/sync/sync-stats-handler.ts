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

  const result = await adapter.count();
  if (!result.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: result.error }),
      { status: 500, headers: API_HEADERS },
    );
  }

  return new Response(
    JSON.stringify({ ok: true, vaults: result.value }),
    { status: 200, headers: API_HEADERS },
  );
}
