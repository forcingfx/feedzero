import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleBriefingRequest } from "@/core/briefings/briefing-proxy-handler";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

function jsonRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://my.feedzero.app/api/briefing", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "sk-ant-test",
      "anthropic-version": "2023-06-01",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("handleBriefingRequest — Anthropic relay", () => {
  it("rejects non-POST methods with 405", async () => {
    for (const method of ["GET", "PUT", "DELETE", "PATCH"]) {
      const res = await handleBriefingRequest(
        new Request("https://my.feedzero.app/api/briefing", { method }),
      );
      expect(res.status).toBe(405);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires the x-api-key header", async () => {
    const res = await handleBriefingRequest(
      new Request("https://my.feedzero.app/api/briefing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-6" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards the body to api.anthropic.com/v1/messages with the supplied headers", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ content: [], usage: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await handleBriefingRequest(
      jsonRequest({ model: "claude-sonnet-4-6", messages: [] }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("x-api-key")).toBe("sk-ant-test");
    expect(headers.get("anthropic-version")).toBe("2023-06-01");
    // The browser-direct header is now meaningless server-side; the
    // relay shouldn't forward it (avoids leaking that the SDK was used
    // browser-side at some point). Anthropic ignores its absence.
    expect(headers.get("anthropic-dangerous-direct-browser-access")).toBeNull();
  });

  it("strips hop-by-hop and request-only headers (cookie, host, origin)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    );

    await handleBriefingRequest(
      jsonRequest(
        { model: "x" },
        {
          cookie: "session=secret",
          host: "my.feedzero.app",
          origin: "https://my.feedzero.app",
          referer: "https://my.feedzero.app/briefings",
          "x-forwarded-for": "1.2.3.4",
        },
      ),
    );

    const init = fetchMock.mock.calls[0][1];
    const headers = new Headers(init.headers);
    expect(headers.get("cookie")).toBeNull();
    expect(headers.get("host")).toBeNull();
    expect(headers.get("origin")).toBeNull();
    expect(headers.get("referer")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBeNull();
  });

  it("forwards the upstream response status, body, and content-type unchanged", async () => {
    const upstreamBody = JSON.stringify({
      content: [{ type: "tool_use", input: { abstract: "x" } }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });
    fetchMock.mockResolvedValueOnce(
      new Response(upstreamBody, {
        status: 200,
        headers: {
          "content-type": "application/json",
          "anthropic-request-id": "req_abc",
        },
      }),
    );

    const res = await handleBriefingRequest(jsonRequest({ model: "x" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/json");
    const body = await res.text();
    expect(body).toBe(upstreamBody);
  });

  it("forwards upstream 401 (invalid key) so the client maps it correctly", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "authentication_error" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const res = await handleBriefingRequest(jsonRequest({ model: "x" }));
    expect(res.status).toBe(401);
  });

  it("forwards upstream 429 (rate limit) so the client maps it correctly", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { type: "rate_limit_error" } }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "60" },
      }),
    );
    const res = await handleBriefingRequest(jsonRequest({ model: "x" }));
    expect(res.status).toBe(429);
  });

  it("returns 502 if the upstream fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("DNS resolution failed"));
    const res = await handleBriefingRequest(jsonRequest({ model: "x" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/anthropic/i);
  });

  it("returns 400 when the request body is missing", async () => {
    const res = await handleBriefingRequest(
      new Request("https://my.feedzero.app/api/briefing", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": "sk-ant-test",
        },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("only allows POST per SUPPORTED_METHODS (single source of truth)", async () => {
    const { SUPPORTED_METHODS } = await import(
      "@/core/briefings/briefing-proxy-handler"
    );
    expect(SUPPORTED_METHODS).toEqual(["POST"]);
  });
});
