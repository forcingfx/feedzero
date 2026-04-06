// src/core/sync/sync-stats-handler.ts
var API_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff"
};
async function handleSyncStatsRequest(request, adapter2) {
  if (request.method !== "GET") {
    return new Response(
      JSON.stringify({ ok: false, error: "Method not allowed" }),
      { status: 405, headers: API_HEADERS }
    );
  }
  const result = await adapter2.count();
  if (!result.ok) {
    return new Response(
      JSON.stringify({ ok: false, error: result.error }),
      { status: 500, headers: API_HEADERS }
    );
  }
  return new Response(
    JSON.stringify({ ok: true, vaults: result.value }),
    { status: 200, headers: API_HEADERS }
  );
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/sync/adapters/vercel-blob-adapter.ts
function createVercelBlobAdapter() {
  return {
    async get(vaultId) {
      try {
        const { head } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;
        let metadata;
        try {
          metadata = await head(pathname);
        } catch {
          return ok(null);
        }
        const response = await fetch(metadata.url);
        if (!response.ok) return ok(null);
        const data = await response.text();
        return ok(data);
      } catch (e) {
        return err(`Vercel Blob get failed: ${e.message}`);
      }
    },
    async put(vaultId, data) {
      try {
        const { put } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;
        await put(pathname, data, {
          access: "public",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json"
        });
        return ok(true);
      } catch (e) {
        return err(`Vercel Blob put failed: ${e.message}`);
      }
    },
    async delete(vaultId) {
      try {
        const { del } = await import("@vercel/blob");
        const pathname = `vaults/${vaultId}.json`;
        await del(pathname);
        return ok(true);
      } catch (e) {
        return err(`Vercel Blob delete failed: ${e.message}`);
      }
    },
    async count() {
      try {
        const { list } = await import("@vercel/blob");
        let total = 0;
        let cursor;
        do {
          const result = await list({
            prefix: "vaults/",
            limit: 1e3,
            ...cursor ? { cursor } : {}
          });
          total += result.blobs.length;
          cursor = result.hasMore ? result.cursor : void 0;
        } while (cursor);
        return ok(total);
      } catch (e) {
        return err(`Vercel Blob count failed: ${e.message}`);
      }
    }
  };
}

// api/stats-sync.ts
var adapter = createVercelBlobAdapter();
async function GET(req) {
  return handleSyncStatsRequest(req, adapter);
}
export {
  GET
};
