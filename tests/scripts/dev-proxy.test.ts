import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { toWebRequest } from "../../scripts/dev-proxy.js";

/**
 * Minimal IncomingMessage stand-in: a Readable stream that yields the body
 * and exposes the metadata fields toWebRequest reads (method, url, headers).
 */
function fakeIncomingMessage(opts: {
  method: string;
  url: string;
  headers: Record<string, string | string[]>;
  body?: string;
}): Readable & { method: string; url: string; headers: Record<string, string | string[]> } {
  const stream = Readable.from(opts.body ? [Buffer.from(opts.body)] : []) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string | string[]>;
  };
  stream.method = opts.method;
  stream.url = opts.url;
  stream.headers = opts.headers;
  return stream;
}

describe("toWebRequest — header forwarding", () => {
  it("forwards Stripe-Signature header (the bug that triggered this test)", async () => {
    const req = fakeIncomingMessage({
      method: "POST",
      url: "/api/stripe/webhook",
      headers: {
        "content-type": "application/json",
        "stripe-signature": "t=1700000000,v1=abc123",
      },
      body: '{"type":"x"}',
    });
    const webReq = await toWebRequest(req);
    expect(webReq.headers.get("stripe-signature")).toBe("t=1700000000,v1=abc123");
  });

  it("forwards Authorization header (license-bearer endpoints depend on this)", async () => {
    const req = fakeIncomingMessage({
      method: "POST",
      url: "/api/license/verify",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer fz_payload.sig",
      },
      body: "{}",
    });
    const webReq = await toWebRequest(req);
    expect(webReq.headers.get("authorization")).toBe("Bearer fz_payload.sig");
  });

  it("preserves Content-Type (regression of original behavior)", async () => {
    const req = fakeIncomingMessage({
      method: "POST",
      url: "/api/feedback",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const webReq = await toWebRequest(req);
    expect(webReq.headers.get("content-type")).toBe("application/json");
  });

  it("collapses array-valued headers to a comma-joined string", async () => {
    // Node IncomingMessage represents some duplicated headers as arrays.
    // Web Request headers store them as comma-joined per RFC 7230.
    const req = fakeIncomingMessage({
      method: "POST",
      url: "/api/x",
      headers: {
        "content-type": "application/json",
        "x-multi": ["a", "b", "c"],
      },
    });
    const webReq = await toWebRequest(req);
    expect(webReq.headers.get("x-multi")).toBe("a, b, c");
  });

  it("skips HTTP/2 pseudo-headers (would crash Web Request constructor)", async () => {
    const req = fakeIncomingMessage({
      method: "GET",
      url: "/api/health",
      headers: {
        ":path": "/api/health",
        ":method": "GET",
        "user-agent": "test",
      },
    });
    // Should not throw; pseudo-headers (`:path`, `:method`) silently skipped,
    // legitimate headers preserved.
    const webReq = await toWebRequest(req);
    expect(webReq.headers.get("user-agent")).toBe("test");
    expect(webReq.headers.get(":path")).toBeNull();
  });

  it("does not forward a body for GET requests", async () => {
    const req = fakeIncomingMessage({
      method: "GET",
      url: "/api/health",
      headers: { "content-type": "application/json" },
    });
    const webReq = await toWebRequest(req);
    expect(webReq.body).toBeNull();
  });

  it("forwards the body for POST", async () => {
    const req = fakeIncomingMessage({
      method: "POST",
      url: "/api/x",
      headers: { "content-type": "application/json" },
      body: '{"hello":"world"}',
    });
    const webReq = await toWebRequest(req);
    const body = await webReq.text();
    expect(body).toBe('{"hello":"world"}');
  });
});
