// @ts-nocheck
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

// src/core/sync/adapters/filesystem-adapter.ts
import fs from "node:fs";
import path from "node:path";

// src/utils/result.ts
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}

// src/core/sync/adapters/filesystem-adapter.ts
var VAULT_ID_PATTERN = /^[0-9a-f]{64}$/;
var TMP_PREFIX = ".tmp-";
function validateVaultId(vaultId) {
  return VAULT_ID_PATTERN.test(vaultId);
}
function createFilesystemAdapter(dataDir) {
  const vaultsDir = path.join(dataDir, "vaults");
  return {
    async get(vaultId) {
      if (!validateVaultId(vaultId)) {
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
      if (!validateVaultId(vaultId)) {
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
      if (!validateVaultId(vaultId)) {
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

// api/stats-sync.ts
console.log(`[stats-sync] adapter=${describeAdapterMode()}`);
var adapter = resolveAdapter();
async function GET(req) {
  return handleSyncStatsRequest(req, adapter);
}
export {
  GET
};
