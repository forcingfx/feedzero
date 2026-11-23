# Upstash storage runbook

What to do when Upstash warns about, or enforces, a **bandwidth**, **command**
or **storage** limit.

## Limits and warnings

Production is the Vercel Marketplace resource `feedzero-upstash`, on Pay As
You Go since 2026-11-23. Open its dashboard with:

```bash
vercel integration open upstash feedzero-upstash
```

| Limit | Free plan | What drives it |
| --- | --- | --- |
| Bandwidth | 10 GB a month | Whole-vault uploads and downloads through `/api/sync` |
| Commands | 500,000 a month | `/api/feed`: one rate-limit command per request, plus sampled catalog hits |
| Storage | 256 MB | Vaults; see the table below |

Treat any Upstash limit email as a production warning. On 2026-11-23 the
Free plan's bandwidth limit suspended the database, and sync, license records,
Stripe event tracking, the catalog and rate limiting all lost storage at once.

### If the database is suspended

1. Read first: `curl https://my.feedzero.app/api/stats-sync`. A 500 naming the
   plan limit confirms the suspension.
2. Restore access by changing the plan in the dashboard. **Do not** create a
   new database, reset this one or rotate its tokens: an empty database makes
   every vault look missing.
3. **Do not** set `SYNC_STORAGE=vercel-blob` as a workaround. Blob may hold
   vaults from May 2026 at the same paths, and a device would import that old
   copy over its newer local data.
4. Verify with `SMOKE_TESTS=1 npx vitest run tests/smoke/sync.test.ts`.
5. Check Stripe for failed webhook deliveries since the suspension began. Stripe
   retries them, but only for a limited window.

## Storage limit

Every server-side writer shares one Upstash database, and only some of them
set a TTL. Keys that never expire:

| Key | Writer | Grows with |
| --- | --- | --- |
| `vault:<vaultId>` | `/api/sync` PUT | one per sync user, up to `MAX_VAULT_SIZE` (8 MiB) each, never removed automatically (ADR 018) |
| `catalog:feed:<url>` + `catalog:ranking` | `/api/feed` (anonymous catalog) | one per unique feed URL ever fetched |
| `license:*`, `customer:*` | license issuance | one per license |
| `vault-meta:lastUpdatedAt` | `/api/sync` PUT | fixed size |

Keys with a TTL (`ratelimit:*`, `seen-event:*`, `vault-meta:count`) clean
themselves up and are never the cause.

### 1. Measure

```bash
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… npx tsx scripts/storage-census.ts
```

Read-only. Prints keys and value bytes per kind, and real vault sizes as
power-of-two buckets. It prints no vault id or customer key. Costs one SCAN
per 100 keys plus one command per key. Bytes are value bytes (`STRLEN`);
Upstash's own figure adds per-key overhead on top.

### 2. Act on what it shows

- **`vault (test sentinel)` is non-zero**: smoke-test leftovers. Remove them
  with `npx tsx scripts/cleanup-sentinel-vaults.ts` (dry run), then
  `--execute`.
- **`vault` dominates and a few vaults are large**: offline full text is
  usually most of a vault (ADR 032). Users shrink it with "Free up space" in
  Settings, and article retention (feature 025) caps it going forward.
- **`vault` dominates through sheer count**: some are likely abandoned. Nothing
  may delete a vault automatically (ADR 018), so expiring idle vaults needs a
  new ADR naming the trade-off before any code.
- **`catalog:feed` is large**: these keys have no TTL. Expiring or pruning
  them is a product decision about the public catalog, not a cleanup.
- **An `other (…)` group appears**: a writer this runbook doesn't know about.
  Find it before deleting anything.
