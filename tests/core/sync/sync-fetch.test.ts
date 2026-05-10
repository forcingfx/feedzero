import { describe, it, expect, vi, beforeEach } from "vitest";
import { syncFetch } from "@/core/sync/sync-fetch";

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

describe("syncFetch — Bearer header attachment", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorageMock.clear();
    fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  it("does NOT attach Authorization when no license token is stored (free path)", async () => {
    await syncFetch("/api/sync");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBeNull();
  });

  it("attaches Authorization: Bearer <token> when a license token is stored", async () => {
    localStorageMock.setItem("feedzero:license-token", "fz_payload.sig");
    await syncFetch("/api/sync");
    const init = fetchMock.mock.calls[0][1] as RequestInit | undefined;
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer fz_payload.sig");
  });

  it("preserves existing init (method, body, headers) when adding Authorization", async () => {
    localStorageMock.setItem("feedzero:license-token", "fz_x.y");
    await syncFetch("/api/sync", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "X-Custom": "v" },
      body: '{"k":"v"}',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(init.body).toBe('{"k":"v"}');
    const headers = new Headers(init.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Custom")).toBe("v");
    expect(headers.get("Authorization")).toBe("Bearer fz_x.y");
  });

  it("does not overwrite an explicitly-set Authorization header (caller intent wins)", async () => {
    localStorageMock.setItem("feedzero:license-token", "fz_stored.sig");
    await syncFetch("/api/sync", {
      headers: { Authorization: "Bearer caller-supplied-override" },
    });
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer caller-supplied-override");
  });
});
