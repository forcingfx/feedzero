import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLicenseStore } from "@/stores/license-store";
import {
  setLicenseToken,
  clearLicenseToken,
  LICENSE_TOKEN_STORAGE_KEY,
} from "@/core/license/license-token-store";
import { base64UrlEncode } from "@/core/license/crypto";
import { encodeLicensePayload, type LicenseTier } from "@/core/license/format";

function makeToken(tier: LicenseTier): string {
  const payload = encodeLicensePayload({
    tier,
    expirySec: 1_800_000_000,
    customerId: "cus_test",
    keyId: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6",
    issuedAtSec: 1_700_000_000,
  });
  // Real tokens have an HMAC signature; the license-store does not verify
  // it locally (server does), so any non-empty stand-in is fine for these
  // tests. The shape check in `license-token-store` only requires `fz_X.Y`.
  return `fz_${base64UrlEncode(payload)}.c2lnbmF0dXJl`;
}

const personalToken = makeToken("personal");
const proToken = makeToken("pro");

function resetStore() {
  useLicenseStore.setState({ tier: "free", verifying: false, lastCheckedAt: null });
}

describe("useLicenseStore", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    resetStore();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("refresh — no token", () => {
    it("sets tier to free and never calls fetch", async () => {
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("free");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("refresh — token present", () => {
    it("decodes tier from the local payload synchronously before server verify", async () => {
      setLicenseToken(personalToken);

      // Make fetch hang so we observe the synchronous-decode tier.
      let resolveFetch!: (v: Response) => void;
      const pending = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchMock.mockReturnValue(pending);

      const refreshPromise = useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("personal");
      expect(useLicenseStore.getState().verifying).toBe(true);

      resolveFetch(
        new Response(JSON.stringify({ ok: true, license: { tier: "personal" } }), {
          status: 200,
        }),
      );
      await refreshPromise;
      expect(useLicenseStore.getState().tier).toBe("personal");
      expect(useLicenseStore.getState().verifying).toBe(false);
    });

    it("updates tier when server returns a different tier than the local decode", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: true, license: { tier: "pro" } }), {
          status: 200,
        }),
      );

      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("pro");
    });

    it("clears the token and resets tier to free when server rejects", async () => {
      setLicenseToken(proToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "revoked" }), {
          status: 200,
        }),
      );

      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("free");
      expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBeNull();
    });

    it("keeps the locally-decoded tier when the network fetch throws", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockRejectedValue(new Error("offline"));

      await useLicenseStore.getState().refresh();
      // Network failure should NOT clear a valid-looking local token —
      // an offline user shouldn't lose their paid status mid-session.
      expect(useLicenseStore.getState().tier).toBe("personal");
      expect(useLicenseStore.getState().verifying).toBe(false);
      expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBe(personalToken);
    });

    it("keeps the locally-decoded tier when the server returns 5xx (transient failure)", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "bad gateway" }), {
          status: 502,
        }),
      );

      await useLicenseStore.getState().refresh();
      // 5xx = transient (Vercel hiccup, Upstash blip). DO NOT silently
      // downgrade a paying customer to Free on a transient blip — they'd
      // see their tier disappear and panic. Only clear on 4xx (server
      // says explicitly: this token is no good).
      expect(useLicenseStore.getState().tier).toBe("personal");
      expect(localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY)).toBe(personalToken);
    });

    it("falls back to free when the token payload is unparseable", async () => {
      // Well-formed-shape token but the payload base64 decodes to gibberish.
      setLicenseToken("fz_bm90LXZhbGlk.c2ln");
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "invalid" }), {
          status: 200,
        }),
      );

      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("free");
    });
  });

  describe("refresh — lastCheckedAt tracking", () => {
    it("stamps lastCheckedAt when there is no token (definitive: free)", async () => {
      const before = Date.now();
      await useLicenseStore.getState().refresh();
      const stamped = useLicenseStore.getState().lastCheckedAt;
      expect(stamped).not.toBeNull();
      expect(stamped as number).toBeGreaterThanOrEqual(before);
    });

    it("stamps lastCheckedAt when the server confirms the tier (200)", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: true, license: { tier: "personal" } }), {
          status: 200,
        }),
      );
      const before = Date.now();
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().lastCheckedAt as number).toBeGreaterThanOrEqual(
        before,
      );
    });

    it("stamps lastCheckedAt when the server rejects the token (4xx)", async () => {
      setLicenseToken(proToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "revoked" }), {
          status: 401,
        }),
      );
      const before = Date.now();
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().lastCheckedAt as number).toBeGreaterThanOrEqual(
        before,
      );
    });

    it("does NOT stamp lastCheckedAt on a transient 5xx (so focus retries sooner)", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, error: "bad gateway" }), {
          status: 502,
        }),
      );
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().lastCheckedAt).toBeNull();
    });

    it("does NOT stamp lastCheckedAt when the network fetch throws", async () => {
      setLicenseToken(personalToken);
      fetchMock.mockRejectedValue(new Error("offline"));
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().lastCheckedAt).toBeNull();
    });
  });

  describe("setTier — test seam", () => {
    it("allows tests to set the tier directly", () => {
      useLicenseStore.getState().setTier("personal");
      expect(useLicenseStore.getState().tier).toBe("personal");
    });
  });

  describe("cross-tab storage events", () => {
    it("re-runs refresh when the license-token key changes in another tab", () => {
      const refreshSpy = vi.spyOn(useLicenseStore.getState(), "refresh");

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LICENSE_TOKEN_STORAGE_KEY,
          newValue: personalToken,
          oldValue: null,
          storageArea: localStorage,
        }),
      );

      expect(refreshSpy).toHaveBeenCalled();
    });

    it("ignores storage events for unrelated keys", () => {
      const refreshSpy = vi.spyOn(useLicenseStore.getState(), "refresh");

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "feedzero:something-else",
          newValue: "x",
          oldValue: null,
          storageArea: localStorage,
        }),
      );

      expect(refreshSpy).not.toHaveBeenCalled();
    });
  });

  describe("clearLicenseToken behavior", () => {
    it("a refresh after clearLicenseToken sees free", async () => {
      setLicenseToken(personalToken);
      clearLicenseToken();
      await useLicenseStore.getState().refresh();
      expect(useLicenseStore.getState().tier).toBe("free");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

});
