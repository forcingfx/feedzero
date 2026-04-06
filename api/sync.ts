// src/utils/constants.ts
var textEncoder = new TextEncoder();
var SYNC = {
  /** Static salt for vault ID derivation (domain separation from encryption key). */
  VAULT_ID_SALT: textEncoder.encode("feedzero:vault-id:v1"),
  /** Static salt seed for deterministic encryption salt derivation. */
  ENCRYPTION_SALT_SEED: textEncoder.encode("feedzero:enc-salt:v1"),
  /** Vault ID is 32 bytes, rendered as 64-character hex string. */
  VAULT_ID_LENGTH: 32,
  /** Deterministic encryption salt length in bytes. */
  ENCRYPTION_SALT_LENGTH: 16,
  /** Maximum vault payload size in bytes (5 MB). */
  MAX_VAULT_SIZE: 5 * 1024 * 1024,
  /** Sync data format version for forward compatibility. */
  FORMAT_VERSION: 1
};

// src/core/sync/sync-handler.ts
var VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;
var API_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff"
};
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
}
function errorResponse(message, status) {
  return jsonResponse({ ok: false, error: message }, status);
}
function validateVaultId(vaultId) {
  if (!vaultId || !VAULT_ID_PATTERN.test(vaultId)) return null;
  return vaultId;
}
async function handleGet(request, adapter2) {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);
  const result = await adapter2.get(vaultId);
  if (!result.ok) return errorResponse(result.error, 500);
  if (result.value === null) return errorResponse("Vault not found", 404);
  return new Response(result.value, { status: 200, headers: API_HEADERS });
}
async function handlePut(request, adapter2) {
  const text = await request.text();
  if (text.length > SYNC.MAX_VAULT_SIZE) {
    return errorResponse("Payload too large", 413);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }
  const vaultId = validateVaultId(body.vaultId ?? null);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);
  if (!body.vault) return errorResponse("Missing vault data", 400);
  const data = JSON.stringify({ ok: true, vault: body.vault });
  const result = await adapter2.put(vaultId, data);
  if (!result.ok) return errorResponse(result.error, 500);
  return jsonResponse({ ok: true, updatedAt: Date.now() });
}
async function handleDelete(request, adapter2) {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);
  const result = await adapter2.delete(vaultId);
  if (!result.ok) return errorResponse(result.error, 500);
  return jsonResponse({ ok: true });
}
var methodHandlers = {
  GET: handleGet,
  HEAD: handleGet,
  PUT: handlePut,
  DELETE: handleDelete
};
var SUPPORTED_METHODS = Object.keys(methodHandlers);
async function handleSyncRequest(request, adapter2) {
  const handler = methodHandlers[request.method];
  if (!handler) return errorResponse("Method not allowed", 405);
  return handler(request, adapter2);
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

// api/sync.ts
var adapter = createVercelBlobAdapter();
async function GET(req) {
  return handleSyncRequest(req, adapter);
}
async function PUT(req) {
  return handleSyncRequest(req, adapter);
}
async function DELETE(req) {
  return handleSyncRequest(req, adapter);
}
async function HEAD(req) {
  return handleSyncRequest(req, adapter);
}
export {
  DELETE,
  GET,
  HEAD,
  PUT
};
