# ADR 006: Sync Storage Adapter Pattern and Passphrase Persistence

## Status
Accepted

## Context
The zero-knowledge sync feature needs server-side storage for encrypted vault blobs. The app must be self-hostable (not locked to Vercel). Users need their passphrase available across sessions on the same device.

## Decision

### Storage Adapter Pattern

All server-side storage uses a `SyncStorageAdapter` interface:

```typescript
interface SyncStorageAdapter {
  get(vaultId: string): Promise<Result<string | null>>;
  put(vaultId: string, data: string): Promise<Result<boolean>>;
}
```

Three implementations ship in Phase 1:

1. **Filesystem adapter** (default) — Stores vaults as `{DATA_DIR}/vaults/{vaultId}.json`. Zero config for self-hosters.
2. **Vercel Blob adapter** — Opt-in via `SYNC_STORAGE=vercel-blob` + `BLOB_READ_WRITE_TOKEN`. For Vercel deployments.
3. **Memory adapter** — Used by Vite dev server and unit tests.

`resolve-adapter.ts` reads `SYNC_STORAGE` env var and returns the correct adapter. Defaults to filesystem.

### Passphrase in localStorage

The sync passphrase is stored in `localStorage` under `feedzero:sync-passphrase`. The storage mode (`local` or `sync`) is stored under `feedzero:storage-mode`.

## Rationale

### Why adapters?
- The app targets open-source self-hosting. Requiring Vercel Blob or any specific vendor would limit adoption.
- Filesystem is the simplest default — works on VPS, Docker, local dev with zero configuration.
- The interface is minimal (2 methods) making new adapters trivial to add (S3, SQLite, etc.).

### Why passphrase in localStorage?
- The threat model is "zero-knowledge server" — the server never sees plaintext.
- Physical device security is out of scope. Users who care about local security can use browser-level protections (device lock, full-disk encryption).
- Local-only users already use a hardcoded default passphrase (`feedzero-default-key`). Storing the sync passphrase is consistent with existing security posture.
- Without persistence, users would need to re-enter the passphrase on every page load, which is unacceptable UX.

### Why Hono for the standalone server?
- 14kB, zero-dependency Web standard framework.
- Uses the same `Request/Response` API as our shared handlers — no translation layer needed.
- Runs on Node, Deno, Bun, Cloudflare Workers, and AWS Lambda.
- The app's API handlers were already written as pure `Request -> Response` functions, so Hono integration is trivial.

## Consequences

- Self-hosters get a working server with `npm run build && npm run serve` using filesystem storage.
- Vercel deployments work with `SYNC_STORAGE=vercel-blob` env var.
- Adding new storage backends (S3, Turso, etc.) requires only implementing the 2-method interface.
- Passphrase in localStorage means anyone with physical access to the device can read it. This is an accepted trade-off.
