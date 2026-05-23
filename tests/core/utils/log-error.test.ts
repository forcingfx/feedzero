import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logError } from "@feedzero/core/utils/log-error";

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

  describe("operator alerting for silent webhook failures", () => {
    let originalFetch: typeof fetch;
    let originalAlertUrl: string | undefined;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      originalAlertUrl = process.env.OPERATOR_ALERT_URL;
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      if (originalAlertUrl === undefined) {
        delete process.env.OPERATOR_ALERT_URL;
      } else {
        process.env.OPERATOR_ALERT_URL = originalAlertUrl;
      }
    });

    it("POSTs to OPERATOR_ALERT_URL when errClass is AcceptedWithIssue", async () => {
      process.env.OPERATOR_ALERT_URL = "https://hooks.example.com/operator";
      const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      logError({
        route: "/api/stripe/webhook",
        method: "POST",
        status: 200,
        traceId: "req_alert",
        errClass: "AcceptedWithIssue",
        errMsg: "Missing tier metadata on price",
      });

      // Alert is fire-and-forget; flush microtasks
      await new Promise((r) => setTimeout(r, 0));

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("https://hooks.example.com/operator");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body as string);
      expect(body.errClass).toBe("AcceptedWithIssue");
      expect(body.errMsg).toBe("Missing tier metadata on price");
      expect(body.traceId).toBe("req_alert");
    });

    it("does NOT POST when errClass is something else (only silent-failure paths alert)", async () => {
      process.env.OPERATOR_ALERT_URL = "https://hooks.example.com/operator";
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      logError({
        route: "/api/sync",
        method: "PUT",
        status: 500,
        traceId: "req_normal_err",
        errClass: "StorageError",
        errMsg: "disk full",
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("is a silent no-op when OPERATOR_ALERT_URL is unset", async () => {
      delete process.env.OPERATOR_ALERT_URL;
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      logError({
        route: "/api/stripe/webhook",
        method: "POST",
        status: 200,
        traceId: "req_x",
        errClass: "AcceptedWithIssue",
        errMsg: "Missing line item period.end",
      });

      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("swallows alert-channel failures (don't crash the original handler)", async () => {
      process.env.OPERATOR_ALERT_URL = "https://hooks.example.com/operator";
      const fetchMock = vi.fn().mockRejectedValue(new Error("hook down"));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      expect(() =>
        logError({
          route: "/api/stripe/webhook",
          method: "POST",
          status: 200,
          traceId: "req_alert_fail",
          errClass: "AcceptedWithIssue",
          errMsg: "boom",
        }),
      ).not.toThrow();

      await new Promise((r) => setTimeout(r, 10));
      // Alert was attempted but it failing didn't propagate
      expect(fetchMock).toHaveBeenCalled();
    });
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
