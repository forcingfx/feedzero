# Upstash storage runbook

What to do when the Upstash plan reports its **storage** limit reached.

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

## 1. Measure

```bash
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… npx tsx scripts/storage-census.ts
```

Read-only. Prints keys and value bytes per kind, and real vault sizes as
power-of-two buckets. It prints no vault id or customer key. Costs one SCAN
per 100 keys plus one command per key. Bytes are value bytes (`STRLEN`);
Upstash's own figure adds per-key overhead on top.

## 2. Act on what it shows

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
