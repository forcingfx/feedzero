import { describe, it, expect, vi } from "vitest";
import { handleMessage, type HandlerContext } from "../../extension/src/handlers.ts";

function baseContext(overrides: Partial<HandlerContext> = {}): HandlerContext {
  return {
    extensionVersion: "0.1.0",
    fetchUrl: vi.fn(async () => ({
      html: "",
      finalUrl: "",
      status: 200,
    })),
    hasPermission: vi.fn(async () => true),
    requestPermission: vi.fn(async () => true),
    ...overrides,
  };
}

describe("extension/handlers", () => {
  describe("handleMessage / ping", () => {
    it("responds to a valid ping with the extension version", async () => {
      const response = await handleMessage(
        { type: "feedzero/ping", requestId: "abc-123", protocolVersion: 1 },
        baseContext(),
      );
      expect(response).toEqual({
        type: "feedzero/ping-response",
        requestId: "abc-123",
        extensionVersion: "0.1.0",
      });
    });

    it("returns null for non-FeedZero messages", async () => {
      const response = await handleMessage(
        { type: "other/thing", requestId: "x", protocolVersion: 1 },
        baseContext(),
      );
      expect(response).toBeNull();
    });

    it("returns null for response-typed messages (avoids echo loops)", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/ping-response",
          requestId: "abc",
          extensionVersion: "0.1.0",
        },
        baseContext(),
      );
      expect(response).toBeNull();
    });

    it("returns null for messages with the wrong protocol version", async () => {
      const response = await handleMessage(
        { type: "feedzero/ping", requestId: "x", protocolVersion: 999 },
        baseContext(),
      );
      expect(response).toBeNull();
    });

    it("returns null for malformed messages", async () => {
      const ctx = baseContext();
      expect(await handleMessage(null, ctx)).toBeNull();
      expect(await handleMessage(undefined, ctx)).toBeNull();
      expect(await handleMessage("ping", ctx)).toBeNull();
      expect(await handleMessage({}, ctx)).toBeNull();
      expect(
        await handleMessage({ type: "feedzero/ping" }, ctx),
      ).toBeNull();
    });
  });

  describe("handleMessage / fetch-article", () => {
    it("returns ok with html when permission is granted and fetch succeeds", async () => {
      const fetchUrl = vi.fn(async () => ({
        html: "<article>Real content</article>",
        finalUrl: "https://nytimes.com/post",
        status: 200,
      }));
      const response = await handleMessage(
        {
          type: "feedzero/fetch-article",
          requestId: "req-1",
          protocolVersion: 1,
          url: "https://nytimes.com/post",
        },
        baseContext({ fetchUrl, hasPermission: async () => true }),
      );
      expect(response).toEqual({
        type: "feedzero/fetch-article-response",
        requestId: "req-1",
        ok: true,
        html: "<article>Real content</article>",
        finalUrl: "https://nytimes.com/post",
        status: 200,
      });
      expect(fetchUrl).toHaveBeenCalledWith("https://nytimes.com/post");
    });

    it("returns no-permission without calling fetch when permission is missing", async () => {
      const fetchUrl = vi.fn();
      const response = await handleMessage(
        {
          type: "feedzero/fetch-article",
          requestId: "req-2",
          protocolVersion: 1,
          url: "https://nytimes.com/post",
        },
        baseContext({ fetchUrl, hasPermission: async () => false }),
      );
      expect(response).toEqual({
        type: "feedzero/fetch-article-response",
        requestId: "req-2",
        ok: false,
        reason: "no-permission",
      });
      expect(fetchUrl).not.toHaveBeenCalled();
    });

    it("returns blocked-scheme for non-http(s) URLs without checking permission", async () => {
      const hasPermission = vi.fn();
      const response = await handleMessage(
        {
          type: "feedzero/fetch-article",
          requestId: "req-3",
          protocolVersion: 1,
          url: "javascript:alert(1)",
        },
        baseContext({ hasPermission }),
      );
      expect(response).toMatchObject({
        ok: false,
        reason: "blocked-scheme",
      });
      expect(hasPermission).not.toHaveBeenCalled();
    });

    it("returns network-error when the fetch implementation throws", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/fetch-article",
          requestId: "req-4",
          protocolVersion: 1,
          url: "https://nytimes.com/post",
        },
        baseContext({
          hasPermission: async () => true,
          fetchUrl: async () => {
            throw new Error("offline");
          },
        }),
      );
      expect(response).toMatchObject({
        ok: false,
        reason: "network-error",
      });
    });

    it("rejects a fetch-article message without a url field", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/fetch-article",
          requestId: "req-5",
          protocolVersion: 1,
        },
        baseContext(),
      );
      expect(response).toBeNull();
    });
  });

  describe("handleMessage / authorize-publisher", () => {
    it("returns granted=true when chrome.permissions.request resolves true", async () => {
      const requestPermission = vi.fn(async () => true);
      const response = await handleMessage(
        {
          type: "feedzero/authorize-publisher",
          requestId: "req-auth-1",
          protocolVersion: 1,
          domain: "nytimes.com",
        },
        baseContext({ requestPermission }),
      );
      expect(response).toEqual({
        type: "feedzero/authorize-publisher-response",
        requestId: "req-auth-1",
        granted: true,
      });
      expect(requestPermission).toHaveBeenCalledWith("https://nytimes.com");
    });

    it("returns granted=false when chrome.permissions.request resolves false", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/authorize-publisher",
          requestId: "req-auth-2",
          protocolVersion: 1,
          domain: "nytimes.com",
        },
        baseContext({ requestPermission: async () => false }),
      );
      expect(response).toMatchObject({
        type: "feedzero/authorize-publisher-response",
        granted: false,
      });
    });

    it("returns granted=false when chrome.permissions.request throws", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/authorize-publisher",
          requestId: "req-auth-3",
          protocolVersion: 1,
          domain: "nytimes.com",
        },
        baseContext({
          requestPermission: async () => {
            throw new Error("user gesture required");
          },
        }),
      );
      expect(response).toMatchObject({
        type: "feedzero/authorize-publisher-response",
        granted: false,
      });
    });

    it("rejects an authorize-publisher message without a domain", async () => {
      const response = await handleMessage(
        {
          type: "feedzero/authorize-publisher",
          requestId: "req-auth-4",
          protocolVersion: 1,
        },
        baseContext(),
      );
      expect(response).toBeNull();
    });

    it("rejects domains with a scheme or path (must be bare host)", async () => {
      const requestPermission = vi.fn(async () => true);
      const response = await handleMessage(
        {
          type: "feedzero/authorize-publisher",
          requestId: "req-auth-5",
          protocolVersion: 1,
          domain: "https://nytimes.com/section",
        },
        baseContext({ requestPermission }),
      );
      expect(response).toMatchObject({
        type: "feedzero/authorize-publisher-response",
        granted: false,
      });
      expect(requestPermission).not.toHaveBeenCalled();
    });
  });
});
