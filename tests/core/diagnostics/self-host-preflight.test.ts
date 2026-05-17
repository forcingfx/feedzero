import { describe, it, expect, vi } from "vitest";
import { runSelfHostPreflight } from "@/core/diagnostics/self-host-preflight";

describe("runSelfHostPreflight", () => {
  it("reports all-passed when secure context, crypto, and endpoints are reachable", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const report = await runSelfHostPreflight({
      isSecureContext: true,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
      fetch: fetchMock,
      origin: "https://feedzero.example.com",
    });
    expect(report.allPassed).toBe(true);
    expect(report.checks.every((c) => c.passed)).toBe(true);
  });

  it("flags the secure-context check when isSecureContext is false", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    const report = await runSelfHostPreflight({
      isSecureContext: false,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
      fetch: fetchMock,
      origin: "http://192.168.1.42:3000",
    });
    expect(report.allPassed).toBe(false);
    const secureCheck = report.checks.find((c) => c.id === "secure-context");
    expect(secureCheck?.passed).toBe(false);
  });

  it("flags the api/feed check when the proxy endpoint is unreachable", async () => {
    // Self-host scenario: server is up but /api/feed isn't wired (operator
    // forgot to run build:all). Preflight catches it before the user
    // tries to add a feed and gets a generic network error.
    const fetchMock = vi
      .fn()
      .mockImplementation((url) =>
        url.includes("/api/feed")
          ? Promise.resolve({ ok: false, status: 404 })
          : Promise.resolve({ ok: true, status: 200 }),
      );
    const report = await runSelfHostPreflight({
      isSecureContext: true,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
      fetch: fetchMock,
      origin: "https://feedzero.example.com",
    });
    const feedCheck = report.checks.find((c) => c.id === "api-feed");
    expect(feedCheck?.passed).toBe(false);
  });

  it("tolerates fetch rejections (the network may be unreachable entirely)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const report = await runSelfHostPreflight({
      isSecureContext: true,
      crypto: { subtle: {} as SubtleCrypto } as Crypto,
      fetch: fetchMock,
      origin: "https://feedzero.example.com",
    });
    expect(report.allPassed).toBe(false);
    // The check should report a failure, not throw.
    expect(report.checks.find((c) => c.id === "api-feed")?.passed).toBe(false);
  });
});
