import { SYNC } from "../../../packages/core/src/utils/constants";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";
import { logError } from "../../../packages/core/src/utils/log-error";
import { logEvent, sizeBucket } from "../../../packages/core/src/utils/log-event";
import type { SyncStorageAdapter } from "./types.ts";
import {
  authorizeLicense,
  type LicenseAuthOptions,
} from "../license/middleware";
import {
  decodePushBody,
  PUSH_ENCODING_HEADER,
  PUSH_ENCODING_GZIP,
  PUSH_BODY_TOO_LARGE,
} from "./vault-transport.ts";

const VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;
const ROUTE = "/api/sync";

/**
 * Build a fresh headers object for each response.
 *
 * **Why this isn't a shared `const` object:** `@hono/node-server@2.0.2`
 * MUTATES the headers object passed to `new Response(body, { headers })`
 * by appending a computed `Content-Length`. If two responses share the
 * same headers object reference, the second response inherits the
 * first response's Content-Length — which truncates the body at the
 * receiver. This was the root cause of issue #117's
 * `JSON.parse: unterminated string at column N` errors: a small PUT
 * response (~37 bytes: `{"ok":true,"updatedAt":<ms>}`) ran first,
 * stamped `Content-Length: 37` onto the shared object, and the next
 * GET response (the encrypted vault, kilobytes long) was sent with
 * `Content-Length: 37` and got cut off after 37 bytes on the wire.
 * Self-hosters with multiple devices observed it; paid users on the
 * hosted backend never did (the bug requires shared in-process state
 * across requests, which Vercel's per-request lambdas don't have).
 */
function apiHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };
}

/**
 * Per-request context threaded through the per-method handlers. Holds the
 * traceId we mint at entry so every error path can echo it back to the
 * client AND write it to the structured server log.
 */
interface RequestContext {
  traceId: string;
  method: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: apiHeaders() });
}

/**
 * Compute a weak ETag for a stored payload. SHA-256 truncated to the
 * first 16 hex characters (64 bits) — collision risk is negligible at
 * one ETag per vault per change, and the short form keeps headers
 * compact. Weak validator (W/"…") because the server may re-serialize
 * structurally-equivalent JSON; the bytes match only the byte-shape
 * stored, not the semantic content.
 */
async function etagOf(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `W/"${hex}"`;
}

function apiHeadersWithEtag(etag: string): Record<string, string> {
  return { ...apiHeaders(), ETag: etag };
}

/**
 * 4xx response — surfaces traceId to the client (so they can quote it in
 * a support report) but does NOT write a server-side log line. Client
 * errors are not ops-actionable; logging them inflates the error log.
 */
function clientError(
  message: string,
  status: number,
  ctx: RequestContext,
): Response {
  return jsonResponse(
    { ok: false, error: message, traceId: ctx.traceId },
    status,
  );
}

/**
 * 5xx response — surfaces traceId to the client AND writes a single-line
 * JSON to the server log via the allow-list logger. The {route, method,
 * status, traceId, errClass, errMsg} tuple is enough to correlate a user
 * report to the failing request without leaking vaultId or any other PII.
 */
function serverError(
  message: string,
  errClass: string,
  status: number,
  ctx: RequestContext,
): Response {
  logError({
    route: ROUTE,
    method: ctx.method,
    status,
    traceId: ctx.traceId,
    errClass,
    errMsg: message,
  });
  return jsonResponse(
    { ok: false, error: message, traceId: ctx.traceId },
    status,
  );
}

function validateVaultId(vaultId: string | null): string | null {
  if (!vaultId || !VAULT_ID_PATTERN.test(vaultId)) return null;
  return vaultId;
}

async function handleGet(
  request: Request,
  adapter: SyncStorageAdapter,
  ctx: RequestContext,
): Promise<Response> {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return clientError("Invalid or missing vaultId", 400, ctx);

  const result = await adapter.get(vaultId);
  if (!result.ok) {
    return serverError(result.error, "AdapterGetFailed", 500, ctx);
  }
  if (result.value === null) return clientError("Vault not found", 404, ctx);

  // Compute the ETag from the stored bytes so the client can
  // short-circuit unchanged pulls. If the client's If-None-Match
  // matches, return 304 (no body) — typical multi-device sync where
  // the user hasn't touched anything between pulls.
  const etag = await etagOf(result.value);
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: apiHeadersWithEtag(etag),
    });
  }
  return new Response(result.value, {
    status: 200,
    headers: apiHeadersWithEtag(etag),
  });
}

/**
 * Read the request body as JSON text, decompressing it when the client
 * says it is gzipped.
 *
 * Both shapes stay supported: a client that predates the compressed
 * transport still PUTs plain JSON, and refusing it would break every
 * device that has not reloaded yet. The compressed path is capped on
 * both sides of the decompression — the received bytes against the
 * wire ceiling, the output against MAX_VAULT_SIZE — because a gzip
 * stream that unpacks to gigabytes is only kilobytes on the wire.
 */
type PutBody =
  | { text: string; receivedBytes: number; encoding: string }
  | { rejection: Response };

async function readPutBody(
  request: Request,
  ctx: RequestContext,
): Promise<PutBody> {
  if (request.headers.get(PUSH_ENCODING_HEADER) !== PUSH_ENCODING_GZIP) {
    const text = await request.text();
    if (text.length > SYNC.MAX_VAULT_SIZE) {
      return { rejection: clientError("Payload too large", 413, ctx) };
    }
    return { text, receivedBytes: text.length, encoding: "identity" };
  }

  const raw = new Uint8Array(await request.arrayBuffer());
  if (raw.byteLength > SYNC.MAX_PUSH_BODY_SIZE) {
    return { rejection: clientError("Payload too large", 413, ctx) };
  }

  const decoded = await decodePushBody(raw, SYNC.MAX_VAULT_SIZE);
  if (!decoded.ok) {
    // An unreadable body is the client's problem, not an ops event: a
    // truncated upload and a hostile one look identical from here.
    return {
      rejection:
        decoded.error === PUSH_BODY_TOO_LARGE
          ? clientError("Payload too large", 413, ctx)
          : clientError("Invalid compressed body", 400, ctx),
    };
  }
  return {
    text: decoded.value,
    receivedBytes: raw.byteLength,
    encoding: PUSH_ENCODING_GZIP,
  };
}

async function handlePut(
  request: Request,
  adapter: SyncStorageAdapter,
  ctx: RequestContext,
): Promise<Response> {
  const putBody = await readPutBody(request, ctx);
  if ("rejection" in putBody) return putBody.rejection;
  const text = putBody.text;

  // Anonymous size sample. This is the only view anyone has of whether
  // vaults are drifting toward the ceiling across the population, and
  // it stays a coarse bucket with nothing identifying whose vault it
  // was — see log-event.ts for why that boundary is where it is.
  logEvent({
    route: ROUTE,
    method: ctx.method,
    event: "vault.put",
    sizeBucket: sizeBucket(putBody.receivedBytes),
    encoding: putBody.encoding,
  });

  let body: { vaultId?: string; vault?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return clientError("Invalid JSON", 400, ctx);
  }

  const vaultId = validateVaultId(body.vaultId ?? null);
  if (!vaultId) return clientError("Invalid or missing vaultId", 400, ctx);
  if (!body.vault) return clientError("Missing vault data", 400, ctx);

  const data = JSON.stringify({ ok: true, vault: body.vault });
  const result = await adapter.put(vaultId, data);
  if (!result.ok) {
    return serverError(result.error, "AdapterPutFailed", 500, ctx);
  }

  // Return the ETag of the just-stored bytes so the client can cache
  // it without an extra GET round-trip — sync push then immediate
  // pull is the most common pattern and would otherwise re-download
  // the same payload.
  const etag = await etagOf(data);
  return new Response(
    JSON.stringify({ ok: true, updatedAt: Date.now() }),
    { status: 200, headers: apiHeadersWithEtag(etag) },
  );
}

async function handleDelete(
  request: Request,
  adapter: SyncStorageAdapter,
  ctx: RequestContext,
): Promise<Response> {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return clientError("Invalid or missing vaultId", 400, ctx);

  const result = await adapter.delete(vaultId);
  if (!result.ok) {
    return serverError(result.error, "AdapterDeleteFailed", 500, ctx);
  }

  return jsonResponse({ ok: true });
}

type MethodHandler = (
  request: Request,
  adapter: SyncStorageAdapter,
  ctx: RequestContext,
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
  const ctx: RequestContext = {
    traceId: newTraceId(),
    method: request.method,
  };

  const handler = methodHandlers[request.method];
  if (!handler) return clientError("Method not allowed", 405, ctx);

  if (options.licenseAuth) {
    const auth = await authorizeLicense(request, options.licenseAuth);
    if (!auth.ok) {
      // Stable client-facing message ("license required") regardless of
      // the underlying authorizeLicense reason. The traceId in the body
      // is the support-ticket bridge to the runtime log.
      return clientError("license required", 401, ctx);
    }
  }

  return handler(request, adapter, ctx);
}
