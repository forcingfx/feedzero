import { describe, it, expect } from "vitest";
import { authorizeLicense } from "@/core/license/middleware";
import { signLicense, type SigningKey } from "@/core/license/sign";
import {
  MemoryLicenseStorage,
  type LicenseStorage,
} from "@/core/license/storage";
import type { LicensePayload } from "@/core/license/format";
import { err, ok, type Result } from "@feedzero/core/utils/result";

const SECRET = "this-is-a-test-signing-secret-32-bytes!";
const key: SigningKey = { secret: SECRET };
const NOW = 1_750_000_000;

const validPayload: LicensePayload = {
  tier: "pro",
  expirySec: 1_800_000_000,
  customerId: "cus_NQpJjB7ehjf2QH",
  keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
  issuedAtSec: 1_700_000_000,
};

/** Build a fresh Request carrying an Authorization header. */
function makeRequest(authorizationHeader?: string): Request {
  const headers = new Headers();
  if (authorizationHeader !== undefined) {
    headers.set("Authorization", authorizationHeader);
  }
  return new Request("https://feedzero.app/api/example", { headers });
}

/** Sign a payload using the real signer so we exercise the verify path. */
async function signTestToken(
  payload: LicensePayload,
  signingKey: SigningKey,
): Promise<string> {
  return signLicense(payload, signingKey);
}

/**
 * Storage that always errors from `isRevoked`. Used to assert that storage
 * outages surface as a failure rather than silently allowing access.
 */
class FailingRevocationStorage implements LicenseStorage {
  private readonly inner = new MemoryLicenseStorage();
  put = this.inner.put.bind(this.inner);
  get = this.inner.get.bind(this.inner);
  revoke = this.inner.revoke.bind(this.inner);
  // PR R extended LicenseStorage with these for the issuer's renewal /
  // revoke flows. The middleware path doesn't exercise them, so we delegate
  // to the in-memory inner so the type contract is satisfied.
  listByCustomer = this.inner.listByCustomer.bind(this.inner);
  revokeAllForCustomer = this.inner.revokeAllForCustomer.bind(this.inner);
  async isRevoked(_keyId: string): Promise<Result<boolean>> {
    return err("kv unavailable");
  }
}

describe("license middleware — authorizeLicense", () => {
  it("returns err when the Authorization header is missing", async () => {
    const storage = new MemoryLicenseStorage();
    const request = makeRequest(undefined);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/missing/i);
  });

  it("returns err when the Authorization scheme is not Bearer", async () => {
    const storage = new MemoryLicenseStorage();
    const request = makeRequest("Basic dXNlcjpwYXNz");
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/scheme/i);
  });

  it("returns err with 'signature' when the bearer token is tampered", async () => {
    const storage = new MemoryLicenseStorage();
    const goodToken = await signTestToken(validPayload, key);
    const [head, sig] = goodToken.split(".");
    const tampered = `${head}X.${sig}`;
    const request = makeRequest(`Bearer ${tampered}`);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/signature/i);
  });

  it("returns err with 'expired' when the bearer token is past its expiry", async () => {
    const storage = new MemoryLicenseStorage();
    const expiredPayload: LicensePayload = {
      ...validPayload,
      expirySec: NOW - 10,
    };
    const token = await signTestToken(expiredPayload, key);
    const request = makeRequest(`Bearer ${token}`);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/expired/i);
  });

  it("returns err with 'revoked' when the keyId is on the deny-list", async () => {
    const storage = new MemoryLicenseStorage();
    await storage.revoke(validPayload.keyId, "test revocation");
    const token = await signTestToken(validPayload, key);
    const request = makeRequest(`Bearer ${token}`);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/revoked/i);
  });

  it("returns err with 'storage' when the revocation lookup itself fails (fail-closed)", async () => {
    const storage = new FailingRevocationStorage();
    const token = await signTestToken(validPayload, key);
    const request = makeRequest(`Bearer ${token}`);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/storage/i);
  });

  it("returns ok with the verified payload for a valid, un-revoked token", async () => {
    const storage = new MemoryLicenseStorage();
    const token = await signTestToken(validPayload, key);
    const request = makeRequest(`Bearer ${token}`);
    const result = await authorizeLicense(request, {
      signingKey: key,
      storage,
      nowSec: NOW,
    });
    expect(result).toEqual(ok({ license: validPayload }));
  });
});
