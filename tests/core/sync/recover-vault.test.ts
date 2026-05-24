import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { open, close, addFeed } from "@/core/storage/db";
import { createFeed } from "@/core/storage/schema";
import { unwrap, isOk, isErr } from "@feedzero/core/utils/result";
import {
  exportVault,
  pushVault,
  recoverVault,
} from "@/core/sync/sync-service";
import {
  encryptVault,
  deriveVaultId,
  deriveVaultKey,
  DEFAULT_NEW_VAULT_KDF,
  LEGACY_KDF_SPEC,
} from "@/core/sync/vault-crypto";

/**
 * Recovery-flow tests: a new device with only the passphrase reads
 * the cloud envelope's stamped KDF, derives the matching key, and
 * returns credentials whose `kdfSpec` matches the envelope. The
 * key-data coupling invariant from CLAUDE.md depends on this — if
 * recoverVault returned the wrong spec, the next push would re-
 * encrypt the cloud vault with a key the original device cannot
 * reproduce.
 */
describe("recoverVault", () => {
  const PASSPHRASE = "carbon mango velvet prism";

  beforeEach(async () => {
    const result = await open(PASSPHRASE);
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
    vi.restoreAllMocks();
  });

  async function stageVaultOnFakeServer(envelopeKdfSpec?: typeof DEFAULT_NEW_VAULT_KDF) {
    const feed = unwrap(
      createFeed({ url: "https://example.com/rss", title: "Recovered" }),
    );
    await addFeed(feed);

    const vault = unwrap(await exportVault());
    const kdfSpec = envelopeKdfSpec;
    const key = unwrap(
      await deriveVaultKey(PASSPHRASE, {
        extractable: true,
        kdfSpec: kdfSpec ?? LEGACY_KDF_SPEC,
      }),
    );
    const encrypted = unwrap(await encryptVault(key, vault, kdfSpec));
    return encrypted;
  }

  it("decrypts a legacy (no-kdf) envelope and returns LEGACY credentials", async () => {
    const encrypted = await stageVaultOnFakeServer();
    expect("kdf" in encrypted).toBe(false);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, vault: encrypted }),
      }),
    );

    const result = await recoverVault(PASSPHRASE);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;

    expect(result.value.credentials.kdfSpec).toEqual(LEGACY_KDF_SPEC);
    expect(result.value.vault.feeds[0].title).toBe("Recovered");
  });

  it("decrypts an Argon2id envelope and returns Argon2id credentials", async () => {
    const spec = {
      kind: "argon2id" as const,
      memoryKib: 256,
      iterations: 1,
      parallelism: 1,
    };
    const encrypted = await stageVaultOnFakeServer(spec);
    expect(encrypted.kdf).toEqual(spec);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, vault: encrypted }),
      }),
    );

    const result = await recoverVault(PASSPHRASE);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;

    expect(result.value.credentials.kdfSpec).toEqual(spec);
    expect(result.value.vault.feeds[0].title).toBe("Recovered");
  });

  it("returns an err with a guiding message on 404 (no vault for this passphrase)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not found"),
      }),
    );

    const result = await recoverVault(PASSPHRASE);
    expect(isErr(result)).toBe(true);
    if (result.ok) return;
    expect(result.error).toMatch(/no cloud vault was found/i);
    expect(result.error).toMatch(/every word matters/i);
  });

  it("recovered credentials' vaultId equals the passphrase-derived vault ID", async () => {
    const encrypted = await stageVaultOnFakeServer();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true, vault: encrypted }),
      }),
    );

    const result = await recoverVault(PASSPHRASE);
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;
    const expectedId = unwrap(await deriveVaultId(PASSPHRASE));
    expect(result.value.credentials.vaultId).toBe(expectedId);
  });
});

/**
 * Auto-upgrade: a recovery-flow caller can upgrade a legacy PBKDF2
 * vault to Argon2id by deriving a new key, re-encrypting the vault
 * with that key, and pushing back to the same vault ID. The cloud
 * envelope is rewritten in place — vault ID derivation is PBKDF2-
 * only by design, so no migration of identifiers is needed.
 */
describe("upgradeVaultKdf", () => {
  const PASSPHRASE = "carbon mango velvet prism";
  const TARGET_SPEC = {
    kind: "argon2id" as const,
    memoryKib: 256,
    iterations: 1,
    parallelism: 1,
  };

  beforeEach(async () => {
    const result = await open(PASSPHRASE);
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
    vi.restoreAllMocks();
  });

  it("re-encrypts a legacy vault with Argon2id and PUTs to the same vault ID", async () => {
    const { upgradeVaultKdf } = await import("@/core/sync/sync-service");

    const legacyKey = unwrap(
      await deriveVaultKey(PASSPHRASE, {
        extractable: true,
        kdfSpec: LEGACY_KDF_SPEC,
      }),
    );
    const vaultId = unwrap(await deriveVaultId(PASSPHRASE));
    const legacyCreds = { vaultId, vaultKey: legacyKey, kdfSpec: LEGACY_KDF_SPEC };

    const vault = unwrap(await exportVault());

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, updatedAt: Date.now() }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await upgradeVaultKdf(
      PASSPHRASE,
      legacyCreds,
      vault,
      TARGET_SPEC,
    );
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;

    // Returned creds carry the new spec, same vault ID, new vault key
    expect(result.value.kdfSpec).toEqual(TARGET_SPEC);
    expect(result.value.vaultId).toBe(vaultId);
    expect(result.value.vaultKey).not.toBe(legacyKey);

    // The push targets the same vault ID and stamps Argon2id on the envelope
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.vaultId).toBe(vaultId);
    expect(body.vault.kdf).toEqual(TARGET_SPEC);
  });

  it("is a no-op when the credentials already use the target spec", async () => {
    const { upgradeVaultKdf } = await import("@/core/sync/sync-service");

    const argonKey = unwrap(
      await deriveVaultKey(PASSPHRASE, {
        extractable: true,
        kdfSpec: TARGET_SPEC,
      }),
    );
    const vaultId = unwrap(await deriveVaultId(PASSPHRASE));
    const argonCreds = { vaultId, vaultKey: argonKey, kdfSpec: TARGET_SPEC };

    const vault = unwrap(await exportVault());

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await upgradeVaultKdf(
      PASSPHRASE,
      argonCreds,
      vault,
      TARGET_SPEC,
    );
    expect(isOk(result)).toBe(true);
    if (!result.ok) return;

    // Same creds returned, no network call
    expect(result.value).toBe(argonCreds);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns err on push failure (caller falls back to legacy creds)", async () => {
    const { upgradeVaultKdf } = await import("@/core/sync/sync-service");

    const legacyKey = unwrap(
      await deriveVaultKey(PASSPHRASE, {
        extractable: true,
        kdfSpec: LEGACY_KDF_SPEC,
      }),
    );
    const vaultId = unwrap(await deriveVaultId(PASSPHRASE));
    const legacyCreds = { vaultId, vaultKey: legacyKey, kdfSpec: LEGACY_KDF_SPEC };

    const vault = unwrap(await exportVault());

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve("Internal error"),
      }),
    );

    const result = await upgradeVaultKdf(
      PASSPHRASE,
      legacyCreds,
      vault,
      TARGET_SPEC,
    );
    expect(isErr(result)).toBe(true);
  });
});

/**
 * pushVault now stamps the credentials' `kdfSpec` onto the cloud
 * envelope. The signup-time wiring in `addVaultKeys` / `initFresh`
 * passes Argon2id by default, so a recovering device sees the
 * memory-hard spec and re-derives the same key.
 */
describe("pushVault stamps the KDF spec on the envelope", () => {
  beforeEach(async () => {
    const result = await open("test-passphrase");
    if (!result.ok) throw new Error(result.error);
  });

  afterEach(() => {
    close();
    indexedDB.deleteDatabase("feedzero");
    vi.restoreAllMocks();
  });

  it("stamps the credentials' kdfSpec on the pushed envelope", async () => {
    const argonSpec = {
      kind: "argon2id" as const,
      memoryKib: 256,
      iterations: 1,
      parallelism: 1,
    };
    const vaultKey = unwrap(
      await deriveVaultKey("test-passphrase", {
        extractable: true,
        kdfSpec: argonSpec,
      }),
    );
    const vaultId = unwrap(await deriveVaultId("test-passphrase"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, updatedAt: Date.now() }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushVault({
      vaultId,
      vaultKey,
      kdfSpec: argonSpec,
    });
    expect(isOk(result)).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.vault.kdf).toEqual(argonSpec);
  });

  it("stamps LEGACY when the credentials say legacy (back-compat for PBKDF2 users)", async () => {
    const vaultKey = unwrap(
      await deriveVaultKey("test-passphrase", {
        extractable: true,
        kdfSpec: LEGACY_KDF_SPEC,
      }),
    );
    const vaultId = unwrap(await deriveVaultId("test-passphrase"));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, updatedAt: Date.now() }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushVault({
      vaultId,
      vaultKey,
      kdfSpec: LEGACY_KDF_SPEC,
    });
    expect(isOk(result)).toBe(true);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.vault.kdf).toEqual(LEGACY_KDF_SPEC);
  });
});
