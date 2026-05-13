import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError } from "@/utils/log-error";

describe("logError", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("writes a single line of JSON to console.error", () => {
    logError({
      route: "/api/sync",
      method: "PUT",
      status: 500,
      traceId: "req_abc12345",
      errClass: "ENOENT",
      errMsg: "Failed to write vault",
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
    const arg = consoleError.mock.calls[0][0] as string;
    // Must be parseable JSON (one structured line, not pretty-printed)
    expect(() => JSON.parse(arg)).not.toThrow();
  });

  it("emits all allow-listed fields and adds a timestamp", () => {
    logError({
      route: "/api/license/verify",
      method: "POST",
      status: 401,
      traceId: "req_xyz98765",
      errClass: "InvalidSignature",
      errMsg: "license revoked",
    });
    const parsed = JSON.parse(consoleError.mock.calls[0][0] as string);
    expect(parsed.route).toBe("/api/license/verify");
    expect(parsed.method).toBe("POST");
    expect(parsed.status).toBe(401);
    expect(parsed.traceId).toBe("req_xyz98765");
    expect(parsed.errClass).toBe("InvalidSignature");
    expect(parsed.errMsg).toBe("license revoked");
    expect(typeof parsed.ts).toBe("string");
    expect(new Date(parsed.ts).toString()).not.toBe("Invalid Date");
  });

  it("does NOT emit a 'vaultId' field even if caller tries to pass one", () => {
    // The TypeScript interface IS the allow-list, but at runtime we
    // defensively drop unknown fields. This test pins that contract —
    // a future change can't accidentally regress the floor.
    logError({
      route: "/api/sync",
      method: "PUT",
      status: 500,
      traceId: "req_safety",
      errClass: "E",
      errMsg: "m",
      // @ts-expect-error — vaultId is not in the allow-list type
      vaultId: "should-not-appear-in-logs-ever",
    });
    const raw = consoleError.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.vaultId).toBeUndefined();
    expect(raw).not.toContain("should-not-appear-in-logs-ever");
  });

  it("does NOT emit other PII-like fields (customerId, email, ip, token)", () => {
    logError({
      route: "/api/stripe/webhook",
      method: "POST",
      status: 400,
      traceId: "req_x",
      errClass: "E",
      errMsg: "m",
      // @ts-expect-error — none of these are in the allow-list. The first
      // excess-property error covers all subsequent excess properties below
      // (TS only reports once per object literal), so a single suppression
      // is correct here. The runtime field-pick is what actually enforces
      // the floor; the type-side just stops a future caller from adding
      // these without a deliberate suppression.
      customerId: "cus_super_secret",
      email: "leak@example.com",
      ip: "203.0.113.42",
      token: "fz_secret.sig",
    });
    const raw = consoleError.mock.calls[0][0] as string;
    expect(raw).not.toContain("cus_super_secret");
    expect(raw).not.toContain("leak@example.com");
    expect(raw).not.toContain("203.0.113.42");
    expect(raw).not.toContain("fz_secret.sig");
  });
});
