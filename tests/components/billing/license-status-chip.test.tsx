import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LicenseStatusChip } from "@/components/billing/license-status-chip";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  writable: true,
});

beforeEach(() => {
  localStorageMock.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("LicenseStatusChip", () => {
  it("renders 'Free' when no license token is stored", async () => {
    render(<LicenseStatusChip />);
    expect(await screen.findByText(/free/i)).toBeInTheDocument();
  });

  it("does NOT call /api/license/verify when no token is stored", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response("{}"),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LicenseStatusChip />);
    await new Promise((r) => setTimeout(r, 30));

    const verifyCalls = fetchMock.mock.calls.filter((c) =>
      c[0].toString().includes("/api/license/verify"),
    );
    expect(verifyCalls).toHaveLength(0);
  });

  it("calls /api/license/verify and renders the verified tier when a token is stored", async () => {
    localStorage.setItem("feedzero:license-token", "fz_payload.signature");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            ok: true,
            license: {
              tier: "personal",
              customerId: "cus_test",
              keyId: "abc",
              issuedAtSec: 1,
              expirySec: 2,
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LicenseStatusChip />);

    expect(await screen.findByText(/personal/i)).toBeInTheDocument();
  });

  it("falls back to 'Free' when the server rejects the token (e.g. revoked)", async () => {
    localStorage.setItem("feedzero:license-token", "fz_payload.signature");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify({ ok: false, error: "license revoked", traceId: "req_x" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LicenseStatusChip />);
    expect(await screen.findByText(/free/i)).toBeInTheDocument();
  });

  it("falls back to 'Free' on network error (defensive — don't pretend paid when offline)", async () => {
    localStorage.setItem("feedzero:license-token", "fz_payload.signature");
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        throw new Error("network down");
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<LicenseStatusChip />);
    expect(await screen.findByText(/free/i)).toBeInTheDocument();
  });
});
