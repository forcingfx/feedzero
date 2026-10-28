import { describe, it, expect } from "vitest";
import {
  takeStorageCensus,
  type CensusClient,
} from "@/core/diagnostics/storage-census";

/**
 * A fake Upstash keyspace. Strings report their length; the one sorted
 * set reports its member count. SCAN pages two keys at a time so the
 * census must follow the cursor to see everything.
 */
function fakeKeyspace(
  strings: Record<string, number>,
  sortedSets: Record<string, number> = {},
): CensusClient {
  const keys = [...Object.keys(strings), ...Object.keys(sortedSets)];
  return {
    async scan(cursor) {
      const start = Number(cursor);
      const next = start + 2 >= keys.length ? 0 : start + 2;
      return [String(next), keys.slice(start, start + 2)];
    },
    async strlen(key) {
      return strings[key] ?? 0;
    },
    async zcard(key) {
      return sortedSets[key] ?? 0;
    },
  };
}

const REAL_VAULT_A = "vault:" + "0123456789abcdef".repeat(4);
const REAL_VAULT_B = "vault:" + "fedcba9876543210".repeat(4);
const SENTINEL_VAULT = "vault:" + "c".repeat(64);

describe("takeStorageCensus", () => {
  it("totals keys and bytes per kind of key across every SCAN page", async () => {
    const census = await takeStorageCensus(
      fakeKeyspace(
        {
          [REAL_VAULT_A]: 3_000_000,
          [REAL_VAULT_B]: 1_000_000,
          [SENTINEL_VAULT]: 1_500_000,
          "vault-meta:lastUpdatedAt": 13,
          "catalog:feed:https://a.example/feed": 200,
          "catalog:feed:https://b.example/feed": 300,
          "license:record:abc": 400,
          "ratelimit:cli_1234abcd": 1,
        },
        { "catalog:ranking": 2 },
      ),
    );

    expect(census.groups).toEqual([
      { kind: "vault", keys: 2, bytes: 4_000_000 },
      { kind: "vault (test sentinel)", keys: 1, bytes: 1_500_000 },
      { kind: "catalog:feed", keys: 2, bytes: 500 },
      { kind: "license", keys: 1, bytes: 400 },
      { kind: "vault-meta", keys: 1, bytes: 13 },
      { kind: "ratelimit", keys: 1, bytes: 1 },
      { kind: "catalog:ranking", keys: 1, bytes: 0, members: 2 },
    ]);
    expect(census.totalBytes).toBe(5_500_914);
  });

  // Same anonymity floor as production logs (ADR 032): a vault's exact
  // size next to its id would single it out, so sizes are reported only
  // as power-of-two buckets and no vault key ever reaches the result.
  it("reports real vault sizes as power-of-two buckets without vault ids", async () => {
    const census = await takeStorageCensus(
      fakeKeyspace({
        [REAL_VAULT_A]: 3_000_000,
        [REAL_VAULT_B]: 1_000_000,
        [SENTINEL_VAULT]: 1_500_000,
      }),
    );

    expect(census.vaultSizeBuckets).toEqual([
      { upToBytes: 1_048_576, vaults: 1 },
      { upToBytes: 4_194_304, vaults: 1 },
    ]);
    expect(JSON.stringify(census)).not.toContain("0123456789abcdef");
  });

  it("groups unknown keys by their first segment so new writers show up", async () => {
    const census = await takeStorageCensus(
      fakeKeyspace({ "mystery:one": 10, "mystery:two": 20, loose: 5 }),
    );

    expect(census.groups).toEqual([
      { kind: "other (mystery)", keys: 2, bytes: 30 },
      { kind: "other (loose)", keys: 1, bytes: 5 },
    ]);
  });
});
