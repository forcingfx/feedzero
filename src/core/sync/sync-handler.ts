import { SYNC } from "../../utils/constants.ts";
import type { SyncStorageAdapter } from "./types.ts";

const VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function errorResponse(message: string, status: number): Response {
  return jsonResponse({ ok: false, error: message }, status);
}

function validateVaultId(vaultId: string | null): string | null {
  if (!vaultId || !VAULT_ID_PATTERN.test(vaultId)) return null;
  return vaultId;
}

async function handleGet(
  request: Request,
  adapter: SyncStorageAdapter,
): Promise<Response> {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);

  const result = await adapter.get(vaultId);
  if (!result.ok) return errorResponse(result.error, 500);
  if (result.value === null) return errorResponse("Vault not found", 404);

  return new Response(result.value, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function handlePut(
  request: Request,
  adapter: SyncStorageAdapter,
): Promise<Response> {
  const text = await request.text();
  if (text.length > SYNC.MAX_VAULT_SIZE) {
    return errorResponse("Payload too large", 413);
  }

  let body: { vaultId?: string; vault?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse("Invalid JSON", 400);
  }

  const vaultId = validateVaultId(body.vaultId ?? null);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);
  if (!body.vault) return errorResponse("Missing vault data", 400);

  const data = JSON.stringify({ ok: true, vault: body.vault });
  const result = await adapter.put(vaultId, data);
  if (!result.ok) return errorResponse(result.error, 500);

  return jsonResponse({ ok: true, updatedAt: Date.now() });
}

async function handleDelete(
  request: Request,
  adapter: SyncStorageAdapter,
): Promise<Response> {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return errorResponse("Invalid or missing vaultId", 400);

  const result = await adapter.delete(vaultId);
  if (!result.ok) return errorResponse(result.error, 500);

  return jsonResponse({ ok: true });
}

/**
 * Shared sync request handler using the Web standard Request/Response API.
 * Can be used by Vercel serverless functions, Hono, or any Web-compatible server.
 */
export async function handleSyncRequest(
  request: Request,
  adapter: SyncStorageAdapter,
): Promise<Response> {
  switch (request.method) {
    case "GET":
      return handleGet(request, adapter);
    case "PUT":
      return handlePut(request, adapter);
    case "DELETE":
      return handleDelete(request, adapter);
    default:
      return errorResponse("Method not allowed", 405);
  }
}
