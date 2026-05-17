import { describe, it, expect } from "vitest";
import {
  checkSecureContext,
  INSECURE_CONTEXT_MESSAGE,
  CRYPTO_MISSING_MESSAGE,
} from "@/core/security/secure-context";

describe("checkSecureContext", () => {
  it("returns ok when both isSecureContext and crypto.subtle are present", () => {
    const result = checkSecureContext({
      isSecureContext: true,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
    });
    expect(result.ok).toBe(true);
  });

  it("returns the insecure-context message when isSecureContext is false", () => {
    // The previous code blamed iOS Lockdown Mode for what is, in 99% of
    // self-host reports, just plain HTTP on a LAN IP. The new message
    // names the real cause and tells the user how to fix it.
    const result = checkSecureContext({
      isSecureContext: false,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
      origin: "http://192.168.1.42:3000",
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.error).toContain("secure context");
    if (!result.ok) {
      expect(result.error).toBe(INSECURE_CONTEXT_MESSAGE);
      expect(result.kind).toBe("insecure-context");
      expect(result.origin).toBe("http://192.168.1.42:3000");
    }
  });

  it("returns the crypto-missing message when isSecureContext is true but subtle is absent (iOS Lockdown / very old browser)", () => {
    const result = checkSecureContext({
      isSecureContext: true,
      crypto: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(CRYPTO_MISSING_MESSAGE);
      expect(result.kind).toBe("crypto-missing");
    }
  });

  it("prefers the insecure-context diagnosis when BOTH are wrong (it's the actionable one)", () => {
    // If we're not in a secure context, that's almost certainly the root
    // cause; telling the user about Lockdown Mode would send them down a
    // wrong path. Surface the secure-context message first.
    const result = checkSecureContext({
      isSecureContext: false,
      crypto: undefined,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe("insecure-context");
  });
});
