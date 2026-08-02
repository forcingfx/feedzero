import { describe, it, expect } from "vitest";
import { describeLicenseError } from "@/lib/describe-license-error.ts";

/**
 * Activation errors reach the user verbatim from the verifier, which
 * speaks in Unix epochs: "token expired (expired=1781618471,
 * now=1785601571)". That tells a support engineer everything and the
 * user nothing — least of all the one thing that resolves it (get a
 * fresh token via email recovery).
 */
describe("describeLicenseError", () => {
  it("turns an expired-token error into a date and a recovery action", () => {
    const result = describeLicenseError(
      "token expired (expired=1781618471, now=1785601571)",
    );

    expect(result.message).toMatch(/expired/i);
    // 1781618471 → 16 June 2026 (locale-formatted, so assert the parts).
    expect(result.message).toMatch(/2026/);
    expect(result.message).not.toMatch(/1781618471|now=/);
    expect(result.action).toBe("recover");
  });

  it("explains a future issuedAt as a device-clock problem", () => {
    const result = describeLicenseError(
      "token issuedAt is in the future (issuedAt=1785601571, now=1781618471)",
    );

    expect(result.message).toMatch(/clock/i);
    expect(result.message).not.toMatch(/issuedAt=/);
    expect(result.action).toBeUndefined();
  });

  it("explains a signature failure as a wrong/truncated token", () => {
    const result = describeLicenseError("invalid signature");

    expect(result.message).toMatch(/couldn't be verified|not valid/i);
    expect(result.action).toBe("recover");
  });

  it("passes through messages it does not recognize", () => {
    const result = describeLicenseError("License verification failed (503)");

    expect(result.message).toBe("License verification failed (503)");
    expect(result.action).toBeUndefined();
  });

  it("tolerates an expiry it cannot parse rather than rendering Invalid Date", () => {
    const result = describeLicenseError("token expired (expired=abc, now=xyz)");

    expect(result.message).toMatch(/expired/i);
    expect(result.message).not.toMatch(/Invalid Date|NaN/);
    expect(result.action).toBe("recover");
  });
});
