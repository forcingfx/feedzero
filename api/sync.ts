// @ts-nocheck
// src/utils/constants.ts
var ARTICLE_GROUPING = {
  WINDOW_MS: 10 * 60 * 1e3,
  MIN_GROUP_SIZE: 5
};
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

// src/utils/trace-id.ts
function newTraceId() {
  return "req_" + crypto.randomUUID().split("-")[0];
}

// src/utils/log-error.ts
var ALLOWED_FIELDS = [
  "route",
  "method",
  "status",
  "traceId",
  "errClass",
  "errMsg"
];
function logError(fields) {
  const safe = {};
  for (const key of ALLOWED_FIELDS) {
    safe[key] = fields[key];
  }
  safe.ts = (/* @__PURE__ */ new Date()).toISOString();
  console.error(JSON.stringify(safe));
  if (fields.errClass === "AcceptedWithIssue") {
    const url = process.env.OPERATOR_ALERT_URL;
    if (url) {
      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(safe)
      }).catch(() => {
      });
    }
  }
}

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/license/format.ts
var TIERS = ["free", "personal", "pro"];
var VERSION = "v1";
function decodeLicensePayload(encoded) {
  if (!encoded) return err("empty input");
  const parts = encoded.split(":");
  if (parts.length !== 6) {
    return err(`invalid format: expected 6 fields, got ${parts.length}`);
  }
  const [version, tier, expirySecRaw, customerId, keyId, issuedAtSecRaw] = parts;
  if (version !== VERSION) {
    return err(`unknown version: ${version}`);
  }
  if (!isLicenseTier(tier)) {
    return err(`unknown tier: ${tier}`);
  }
  const expirySec = Number(expirySecRaw);
  if (!Number.isFinite(expirySec) || !Number.isInteger(expirySec)) {
    return err(`expiry must be an integer number, got ${expirySecRaw}`);
  }
  const issuedAtSec = Number(issuedAtSecRaw);
  if (!Number.isFinite(issuedAtSec) || !Number.isInteger(issuedAtSec)) {
    return err(`issuedAt must be an integer number, got ${issuedAtSecRaw}`);
  }
  return ok({ tier, expirySec, customerId, keyId, issuedAtSec });
}
function isLicenseTier(value) {
  return TIERS.includes(value);
}

// src/core/license/crypto.ts
async function hmacSha256(message, secret) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message)
  );
  return new Uint8Array(signature);
}
function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlDecodeToString(input) {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - padded.length % 4) % 4;
  const b64 = padded + "=".repeat(padLen);
  try {
    return atob(b64);
  } catch {
    return "";
  }
}

// src/core/license/verify.ts
var TOKEN_PREFIX = "fz_";
async function verifyLicense(token, key, options = {}) {
  if (!token) return err("empty token");
  if (!token.startsWith(TOKEN_PREFIX)) {
    return err(`invalid token prefix (expected ${TOKEN_PREFIX})`);
  }
  const body = token.slice(TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) {
    return err(`invalid token format: expected 2 parts, got ${parts.length}`);
  }
  const [encodedPayloadB64, signatureB64] = parts;
  const encodedPayload = base64UrlDecodeToString(encodedPayloadB64);
  const expectedSignature = await hmacSha256(encodedPayload, key.secret);
  const expectedSignatureB64 = base64UrlEncode(expectedSignature);
  if (!constantTimeEqual(signatureB64, expectedSignatureB64)) {
    return err("invalid signature");
  }
  const payloadResult = decodeLicensePayload(encodedPayload);
  if (!payloadResult.ok) return payloadResult;
  const payload = payloadResult.value;
  const nowSec = options.nowSec ?? Math.floor(Date.now() / 1e3);
  if (payload.issuedAtSec > nowSec) {
    return err(
      `token issuedAt is in the future (issuedAt=${payload.issuedAtSec}, now=${nowSec})`
    );
  }
  if (payload.expirySec < nowSec) {
    return err(
      `token expired (expired=${payload.expirySec}, now=${nowSec})`
    );
  }
  return ok(payload);
}
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    let dummy = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) dummy |= a.charCodeAt(i) ^ b.charCodeAt(i);
    void dummy;
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// src/core/license/middleware.ts
var BEARER_SCHEME = "Bearer ";
async function authorizeLicense(request, options) {
  const tokenResult = parseBearerToken(request.headers.get("Authorization"));
  if (!tokenResult.ok) return tokenResult;
  const verifyResult = await verifyLicense(tokenResult.value, options.signingKey, {
    nowSec: options.nowSec
  });
  if (!verifyResult.ok) return verifyResult;
  const payload = verifyResult.value;
  const revokedResult = await options.storage.isRevoked(payload.keyId);
  if (!revokedResult.ok) {
    return err(`license storage error: ${revokedResult.error}`);
  }
  if (revokedResult.value) {
    return err("license revoked");
  }
  return ok({ license: payload });
}
function parseBearerToken(headerValue) {
  if (!headerValue) return err("missing Authorization header");
  if (!headerValue.startsWith(BEARER_SCHEME)) {
    return err("invalid Authorization scheme (expected Bearer)");
  }
  return ok(headerValue.slice(BEARER_SCHEME.length));
}

// src/core/sync/sync-handler.ts
var VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;
var ROUTE = "/api/sync";
function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff"
  };
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: apiHeaders() });
}
function clientError(message, status, ctx) {
  return jsonResponse(
    { ok: false, error: message, traceId: ctx.traceId },
    status
  );
}
function serverError(message, errClass, status, ctx) {
  logError({
    route: ROUTE,
    method: ctx.method,
    status,
    traceId: ctx.traceId,
    errClass,
    errMsg: message
  });
  return jsonResponse(
    { ok: false, error: message, traceId: ctx.traceId },
    status
  );
}
function validateVaultId(vaultId) {
  if (!vaultId || !VAULT_ID_PATTERN.test(vaultId)) return null;
  return vaultId;
}
async function handleGet(request, adapter, ctx) {
  const url = new URL(request.url);
  const rawId = url.searchParams.get("vaultId");
  const vaultId = validateVaultId(rawId);
  if (!vaultId) return clientError("Invalid or missing vaultId", 400, ctx);
  const result = await adapter.get(vaultId);
  if (!result.ok) {
    return serverError(result.error, "AdapterGetFailed", 500, ctx);
  }
  if (result.value === null) return clientError("Vault not found", 404, ctx);
  return new Response(result.value, { status: 200, headers: apiHeaders() });
}
async function handlePut(request, adapter, ctx) {
  const text = await request.text();
  if (text.length > SYNC.MAX_VAULT_SIZE) {
    return clientError("Payload too large", 413, ctx);
  }
  let body;
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
  return jsonResponse({ ok: true, updatedAt: Date.now() });
}
async function handleDelete(request, adapter, ctx) {
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
var methodHandlers = {
  GET: handleGet,
  HEAD: handleGet,
  PUT: handlePut,
  DELETE: handleDelete
};
var SUPPORTED_METHODS = Object.keys(methodHandlers);
async function handleSyncRequest(request, adapter, options = {}) {
  const ctx = {
    traceId: newTraceId(),
    method: request.method
  };
  const handler = methodHandlers[request.method];
  if (!handler) return clientError("Method not allowed", 405, ctx);
  if (options.licenseAuth) {
    const auth = await authorizeLicense(request, options.licenseAuth);
    if (!auth.ok) {
      return clientError("license required", 401, ctx);
    }
  }
  return handler(request, adapter, ctx);
}

// src/core/sync/adapters/filesystem-adapter.ts
import fs from "node:fs";
import path from "node:path";
var VAULT_ID_PATTERN2 = /^[0-9a-f]{64}$/;
var TMP_PREFIX = ".tmp-";
function validateVaultId2(vaultId) {
  return VAULT_ID_PATTERN2.test(vaultId);
}
function createFilesystemAdapter(dataDir) {
  const vaultsDir = path.join(dataDir, "vaults");
  return {
    async get(vaultId) {
      if (!validateVaultId2(vaultId)) {
        return err("Invalid vault ID");
      }
      const filePath = path.join(vaultsDir, `${vaultId}.json`);
      try {
        const data = fs.readFileSync(filePath, "utf-8");
        return ok(data);
      } catch (e) {
        if (e.code === "ENOENT") {
          return ok(null);
        }
        return err(`Failed to read vault: ${e.message}`);
      }
    },
    async put(vaultId, data) {
      if (!validateVaultId2(vaultId)) {
        return err("Invalid vault ID");
      }
      const destPath = path.join(vaultsDir, `${vaultId}.json`);
      const tmpPath = path.join(
        vaultsDir,
        `${TMP_PREFIX}${process.pid}-${Math.random().toString(36).slice(2)}-${vaultId}`
      );
      try {
        fs.mkdirSync(vaultsDir, { recursive: true });
        try {
          fs.writeFileSync(tmpPath, data, { encoding: "utf-8", flag: "wx" });
          fs.renameSync(tmpPath, destPath);
        } catch (writeErr) {
          try {
            fs.rmSync(tmpPath, { force: true });
          } catch {
          }
          throw writeErr;
        }
        return ok(true);
      } catch (e) {
        return err(`Failed to write vault: ${e.message}`);
      }
    },
    async delete(vaultId) {
      if (!validateVaultId2(vaultId)) {
        return err("Invalid vault ID");
      }
      try {
        fs.rmSync(path.join(vaultsDir, `${vaultId}.json`));
        return ok(true);
      } catch (e) {
        if (e.code === "ENOENT") {
          return ok(true);
        }
        return err(`Failed to delete vault: ${e.message}`);
      }
    },
    async count() {
      try {
        const files = fs.readdirSync(vaultsDir).filter((f) => f.endsWith(".json") && !f.startsWith(TMP_PREFIX));
        return ok(files.length);
      } catch (e) {
        if (e.code === "ENOENT") {
          return ok(0);
        }
        return err(`Failed to count vaults: ${e.message}`);
      }
    }
  };
}

// src/core/sync/adapters/memory-adapter.ts
function createMemoryAdapter() {
  const store = /* @__PURE__ */ new Map();
  return {
    async get(vaultId) {
      return ok(store.get(vaultId) ?? null);
    },
    async put(vaultId, data) {
      store.set(vaultId, data);
      return ok(true);
    },
    async delete(vaultId) {
      store.delete(vaultId);
      return ok(true);
    },
    async count() {
      return ok(store.size);
    }
  };
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

// src/core/sync/adapters/upstash-adapter.ts
var VAULT_KEY_PREFIX = "vault:";
var SCAN_PAGE_SIZE = 100;
function vaultKey(vaultId) {
  return VAULT_KEY_PREFIX + vaultId;
}
async function tryUpstash(op) {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash sync error: ${message}`);
  }
}
var UpstashSyncAdapter = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async get(vaultId) {
    return tryUpstash(async () => {
      const value = await this.client.get(vaultKey(vaultId));
      if (value === null || value === void 0) return null;
      return typeof value === "string" ? value : JSON.stringify(value);
    });
  }
  async put(vaultId, data) {
    return tryUpstash(async () => {
      await this.client.set(vaultKey(vaultId), data);
      return true;
    });
  }
  async delete(vaultId) {
    return tryUpstash(async () => {
      await this.client.del(vaultKey(vaultId));
      return true;
    });
  }
  async count() {
    return tryUpstash(async () => {
      let cursor = 0;
      let total = 0;
      do {
        const [nextCursor, keys] = await this.client.scan(cursor, {
          match: `${VAULT_KEY_PREFIX}*`,
          count: SCAN_PAGE_SIZE
        });
        total += keys.length;
        cursor = nextCursor;
      } while (cursor !== 0 && cursor !== "0");
      return total;
    });
  }
};
function resolveUpstashCredentials(env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}
function hasUpstashSyncCredentials(env = process.env) {
  return resolveUpstashCredentials(env) !== null;
}
async function createUpstashSyncAdapter(env = process.env) {
  const creds = resolveUpstashCredentials(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN."
    );
  }
  const { Redis } = await import("@upstash/redis");
  return new UpstashSyncAdapter(
    new Redis({
      url: creds.url,
      token: creds.token,
      // CRITICAL: vault payloads are already JSON-serialized strings
      // produced by `sync-handler.ts:handlePut` and consumed by GET as
      // raw strings. The Upstash SDK's default behavior is to auto-parse
      // any stored string that looks like JSON back into a JS object on
      // GET — that turns our `'{"ok":true,"vault":{...}}'` string into
      // an Object, which `new Response(obj, ...)` then renders as the
      // literal `"[object Object]"`. Bug live since PR #45; caught only
      // by the post-deploy smoke test in `tests/smoke/sync.test.ts`.
      // See README of @upstash/redis for the flag's full semantics.
      automaticDeserialization: false
    })
  );
}

// src/core/sync/adapters/resolve-adapter.ts
function resolveAdapter(storage, dataDir) {
  const mode = describeAdapterMode(storage);
  switch (mode) {
    case "upstash":
      return wrapAsyncAdapter(createUpstashSyncAdapter());
    case "vercel-blob":
      return createVercelBlobAdapter();
    case "memory":
      return createMemoryAdapter();
    case "filesystem":
    default:
      return createFilesystemAdapter(
        dataDir ?? process.env.DATA_DIR ?? "./data"
      );
  }
}
function describeAdapterMode(storage) {
  const explicitMode = storage ?? process.env.SYNC_STORAGE;
  if (explicitMode) return explicitMode;
  if (hasUpstashSyncCredentials()) return "upstash";
  if (process.env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  return "filesystem";
}
function wrapAsyncAdapter(adapterPromise) {
  return {
    async get(vaultId) {
      return (await adapterPromise).get(vaultId);
    },
    async put(vaultId, data) {
      return (await adapterPromise).put(vaultId, data);
    },
    async delete(vaultId) {
      return (await adapterPromise).delete(vaultId);
    },
    async count() {
      return (await adapterPromise).count();
    }
  };
}

// src/core/license/storage.ts
var MemoryLicenseStorage = class {
  records = /* @__PURE__ */ new Map();
  denyList = /* @__PURE__ */ new Set();
  async put(record) {
    this.records.set(record.keyId, { ...record });
    return { ok: true, value: void 0 };
  }
  async get(keyId) {
    const record = this.records.get(keyId);
    return { ok: true, value: record ? { ...record } : null };
  }
  async listByCustomer(customerId) {
    const matches = [];
    for (const record of this.records.values()) {
      if (record.customerId === customerId) matches.push({ ...record });
    }
    return { ok: true, value: matches };
  }
  async revoke(keyId, _reason) {
    this.denyList.add(keyId);
    return { ok: true, value: void 0 };
  }
  async revokeAllForCustomer(customerId, _reason) {
    for (const record of this.records.values()) {
      if (record.customerId === customerId) this.denyList.add(record.keyId);
    }
    return { ok: true, value: void 0 };
  }
  async isRevoked(keyId) {
    return { ok: true, value: this.denyList.has(keyId) };
  }
};

// src/core/license/storage-upstash.ts
var RECORD_PREFIX = "license:record:";
var REVOKED_PREFIX = "license:revoked:";
var CUSTOMER_INDEX_PREFIX = "customer:";
var CUSTOMER_INDEX_SUFFIX = ":keys";
function recordKey(keyId) {
  return RECORD_PREFIX + keyId;
}
function revokedKey(keyId) {
  return REVOKED_PREFIX + keyId;
}
function customerIndexKey(customerId) {
  return CUSTOMER_INDEX_PREFIX + customerId + CUSTOMER_INDEX_SUFFIX;
}
async function tryUpstash2(op) {
  try {
    return ok(await op());
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`upstash storage error: ${message}`);
  }
}
var UpstashLicenseStorage = class {
  constructor(client) {
    this.client = client;
  }
  client;
  async put(record) {
    return tryUpstash2(async () => {
      await this.client.set(recordKey(record.keyId), record);
      await this.client.sadd(customerIndexKey(record.customerId), record.keyId);
    });
  }
  async get(keyId) {
    return tryUpstash2(() => this.client.get(recordKey(keyId)));
  }
  async listByCustomer(customerId) {
    const keysResult = await tryUpstash2(
      () => this.client.smembers(customerIndexKey(customerId))
    );
    if (!keysResult.ok) return keysResult;
    const records = [];
    for (const keyId of keysResult.value) {
      const recordResult = await this.get(keyId);
      if (!recordResult.ok) return recordResult;
      if (recordResult.value !== null) records.push(recordResult.value);
    }
    return ok(records);
  }
  async revoke(keyId, reason) {
    return tryUpstash2(async () => {
      await this.client.set(revokedKey(keyId), reason);
    });
  }
  async revokeAllForCustomer(customerId, reason) {
    const keysResult = await tryUpstash2(
      () => this.client.smembers(customerIndexKey(customerId))
    );
    if (!keysResult.ok) return keysResult;
    for (const keyId of keysResult.value) {
      const revokeResult = await this.revoke(keyId, reason);
      if (!revokeResult.ok) return revokeResult;
    }
    return ok(void 0);
  }
  async isRevoked(keyId) {
    const result = await tryUpstash2(
      () => this.client.exists(revokedKey(keyId))
    );
    if (!result.ok) return result;
    return ok(result.value === 1);
  }
};
function resolveUpstashCredentials2(env) {
  const url = env.UPSTASH_REDIS_REST_URL ?? env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN ?? env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}
function hasUpstashCredentials(env = process.env) {
  return resolveUpstashCredentials2(env) !== null;
}
async function createUpstashLicenseStorage(env = process.env) {
  const creds = resolveUpstashCredentials2(env);
  if (!creds) {
    throw new Error(
      "Upstash REST credentials not found. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, or use the Vercel Marketplace Upstash integration which auto-injects KV_REST_API_URL + KV_REST_API_TOKEN."
    );
  }
  const { Redis } = await import("@upstash/redis");
  return new UpstashLicenseStorage(
    new Redis({ url: creds.url, token: creds.token })
  );
}

// src/core/license/resolve-storage.ts
async function resolveLicenseStorage(env = process.env) {
  if (hasUpstashCredentials(env)) {
    return createUpstashLicenseStorage(env);
  }
  return new MemoryLicenseStorage();
}

// src/core/flags/flags.ts
function isFlagEnabled(name, env = process.env) {
  if (env.SELF_HOSTED === "1" && name === "LAUNCH_PAID_TIER") return false;
  return env[name] === "1";
}

// api/sync.ts
// Cloud sync is a Free-tier feature — the wiring layer never sets
// `licenseAuth`. The mechanism still lives in sync-handler.ts for any
// future gate that needs it.
var syncAdapter = resolveAdapter();
async function dispatch(req) {
  return handleSyncRequest(req, syncAdapter);
}
async function GET(req) {
  return dispatch(req);
}
async function PUT(req) {
  return dispatch(req);
}
async function DELETE(req) {
  return dispatch(req);
}
async function HEAD(req) {
  return dispatch(req);
}
export {
  DELETE,
  GET,
  HEAD,
  PUT
};
