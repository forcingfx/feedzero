import { SYNC } from "../../utils/constants.ts";
import type { SyncStorageAdapter } from "./types.ts";
import {
  authorizeLicense,
  type LicenseAuthOptions,
} from "../license/middleware";

const VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;

const API_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: API_HEADERS });
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

  return new Response(result.value, { status: 200, headers: API_HEADERS });
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

type MethodHandler = (
  request: Request,
  adapter: SyncStorageAdapter,
) => Promise<Response>;

/**
 * Maps each supported HTTP method to its handler function.
 * This is the single source of truth — SUPPORTED_METHODS is derived from it
 * so the two cannot drift apart.
 *
 * HEAD reuses handleGet — per HTTP/1.1 spec (RFC 7231), HEAD returns the same
 * status and headers as GET but with no body. The HTTP layer strips the body.
 */
const methodHandlers: Record<string, MethodHandler> = {
  GET: handleGet,
  HEAD: handleGet,
  PUT: handlePut,
  DELETE: handleDelete,
};

/**
 * HTTP methods supported by the sync endpoint.
 * Every routing layer (Vercel exports, Hono, etc.) must expose handlers
 * for each of these methods. Tested by the routing contract in server.test.ts.
 */
export const SUPPORTED_METHODS: readonly string[] = Object.keys(methodHandlers);

/**
 * Optional bag of dependencies for runtime gating. Today only `licenseAuth`
 * is supported — when present, the handler runs {@link authorizeLicense}
 * (signature + revocation check) before any data path. When absent, the
 * handler behaves exactly as before (free sync, current default).
 *
 * The flag check (LAUNCH_PAID_TIER) lives in the wiring layer
 * (server.ts / vite.config.js / api/sync.ts), not here — keeps the handler
 * pure and the gate easy to flip without touching this file.
 */
export interface SyncHandlerOptions {
  licenseAuth?: LicenseAuthOptions;
}

/**
 * Shared sync request handler using the Web standard Request/Response API.
 * Can be used by Vercel serverless functions, Hono, or any Web-compatible server.
 */
export async function handleSyncRequest(
  request: Request,
  adapter: SyncStorageAdapter,
  options: SyncHandlerOptions = {},
): Promise<Response> {
  const handler = methodHandlers[request.method];
  if (!handler) return errorResponse("Method not allowed", 405);

  if (options.licenseAuth) {
    const auth = await authorizeLicense(request, options.licenseAuth);
    if (!auth.ok) {
      // Surface the structured error for observability but use a stable
      // message for clients ("license required" rather than internal text).
      return errorResponse("license required", 401);
    }
  }

  return handler(request, adapter);
}
