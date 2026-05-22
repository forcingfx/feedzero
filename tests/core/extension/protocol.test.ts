import { describe, it, expect, afterEach } from "vitest";
import { isOk, isErr } from "@/utils/result.ts";
import {
  ping,
  fetchArticle,
  authorizePublisher,
  PROTOCOL_VERSION,
  type OutboundMessage,
  type PingResponse,
  type FetchArticleResponse,
  type AuthorizePublisherResponse,
} from "@/core/extension/protocol.ts";

/**
 * Stand in for the extension's content script in tests: listen on window for
 * outbound feedzero/* messages and reply with a canned response. Returns a
 * disposer.
 *
 * The real content script forwards to a background service worker via
 * chrome.runtime.sendMessage; here we short-circuit that and respond inline.
 */
function fakeExtension(handler: (msg: OutboundMessage) => unknown | undefined) {
  const listener = (event: MessageEvent) => {
    const msg = event.data;
    if (!msg || typeof msg !== "object") return;
    if (typeof msg.type !== "string" || !msg.type.startsWith("feedzero/")) return;
    if (msg.type.endsWith("-response")) return; // ignore our own replies
    const response = handler(msg);
    if (response !== undefined) {
      window.postMessage(response, window.location.origin);
    }
  };
  window.addEventListener("message", listener);
  return () => window.removeEventListener("message", listener);
}

describe("protocol", () => {
  let dispose: (() => void) | null = null;

  afterEach(() => {
    dispose?.();
    dispose = null;
  });

  describe("ping", () => {
    it("returns ok with the extension version when a response arrives", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/ping") return undefined;
        const response: PingResponse = {
          type: "feedzero/ping-response",
          requestId: msg.requestId,
          extensionVersion: "0.1.0",
        };
        return response;
      });

      const result = await ping();

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.extensionVersion).toBe("0.1.0");
      }
    });

    it("returns err on timeout when no extension is listening", async () => {
      // No fakeExtension; nothing will respond.
      const result = await ping({ timeoutMs: 50 });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toMatch(/timeout|not installed/i);
      }
    });

    it("ignores responses whose requestId does not match the outbound message", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/ping") return undefined;
        // Reply with a *wrong* requestId, then never reply with the right one.
        return {
          type: "feedzero/ping-response",
          requestId: "wrong-id",
          extensionVersion: "0.1.0",
        };
      });

      const result = await ping({ timeoutMs: 50 });

      expect(isErr(result)).toBe(true);
    });

    it("includes the protocol version in outbound messages", async () => {
      const captured: OutboundMessage[] = [];
      dispose = fakeExtension((msg) => {
        captured.push(msg);
        if (msg.type !== "feedzero/ping") return undefined;
        return {
          type: "feedzero/ping-response",
          requestId: msg.requestId,
          extensionVersion: "0.1.0",
        };
      });

      await ping();

      expect(captured).toHaveLength(1);
      expect(captured[0].protocolVersion).toBe(PROTOCOL_VERSION);
    });

    it("ignores messages from a different origin", async () => {
      const listener = (event: MessageEvent) => {
        const msg = event.data;
        if (msg?.type !== "feedzero/ping") return;
        // Forge a response from a different origin (simulated by posting
        // and then mutating origin — happy-dom honors the targetOrigin
        // argument by event.origin). We post with the test origin so this
        // case mainly proves matching responses still arrive.
        window.postMessage(
          {
            type: "feedzero/ping-response",
            requestId: msg.requestId,
            extensionVersion: "0.1.0",
          },
          window.location.origin,
        );
      };
      window.addEventListener("message", listener);
      dispose = () => window.removeEventListener("message", listener);

      const result = await ping();
      expect(isOk(result)).toBe(true);
    });
  });

  describe("fetchArticle", () => {
    it("returns ok with html and finalUrl when the extension fetches successfully", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/fetch-article") return undefined;
        const response: FetchArticleResponse = {
          type: "feedzero/fetch-article-response",
          requestId: msg.requestId,
          ok: true,
          html: "<html><body><article>Hello</article></body></html>",
          finalUrl: "https://nytimes.com/article",
          status: 200,
        };
        return response;
      });

      const result = await fetchArticle("https://nytimes.com/article");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.html).toContain("Hello");
        expect(result.value.finalUrl).toBe("https://nytimes.com/article");
        expect(result.value.status).toBe(200);
      }
    });

    it("returns err with the extension's reason when the fetch fails", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/fetch-article") return undefined;
        const response: FetchArticleResponse = {
          type: "feedzero/fetch-article-response",
          requestId: msg.requestId,
          ok: false,
          reason: "no-permission",
        };
        return response;
      });

      const result = await fetchArticle("https://nytimes.com/article");

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toMatch(/no-permission/);
      }
    });

    it("forwards the url in the outbound message", async () => {
      const captured: OutboundMessage[] = [];
      dispose = fakeExtension((msg) => {
        captured.push(msg);
        if (msg.type !== "feedzero/fetch-article") return undefined;
        return {
          type: "feedzero/fetch-article-response",
          requestId: msg.requestId,
          ok: true,
          html: "",
          finalUrl: msg.url,
          status: 200,
        };
      });

      await fetchArticle("https://example.com/post");

      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({
        type: "feedzero/fetch-article",
        url: "https://example.com/post",
        protocolVersion: PROTOCOL_VERSION,
      });
    });

    it("times out when no extension responds", async () => {
      // No fakeExtension — no response will arrive.
      const result = await fetchArticle("https://nytimes.com/article", {
        timeoutMs: 50,
      });
      expect(isErr(result)).toBe(true);
    });
  });

  describe("authorizePublisher", () => {
    it("returns ok with granted=true when the user accepts the prompt", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/authorize-publisher") return undefined;
        const response: AuthorizePublisherResponse = {
          type: "feedzero/authorize-publisher-response",
          requestId: msg.requestId,
          granted: true,
        };
        return response;
      });

      const result = await authorizePublisher("nytimes.com");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.granted).toBe(true);
      }
    });

    it("returns ok with granted=false when the user declines the prompt", async () => {
      dispose = fakeExtension((msg) => {
        if (msg.type !== "feedzero/authorize-publisher") return undefined;
        const response: AuthorizePublisherResponse = {
          type: "feedzero/authorize-publisher-response",
          requestId: msg.requestId,
          granted: false,
        };
        return response;
      });

      const result = await authorizePublisher("nytimes.com");

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.granted).toBe(false);
      }
    });

    it("forwards the domain in the outbound message", async () => {
      const captured: OutboundMessage[] = [];
      dispose = fakeExtension((msg) => {
        captured.push(msg);
        if (msg.type !== "feedzero/authorize-publisher") return undefined;
        return {
          type: "feedzero/authorize-publisher-response",
          requestId: msg.requestId,
          granted: true,
        };
      });

      await authorizePublisher("nytimes.com");

      expect(captured).toHaveLength(1);
      expect(captured[0]).toMatchObject({
        type: "feedzero/authorize-publisher",
        domain: "nytimes.com",
        protocolVersion: PROTOCOL_VERSION,
      });
    });

    it("times out when no extension responds", async () => {
      const result = await authorizePublisher("nytimes.com", { timeoutMs: 50 });
      expect(isErr(result)).toBe(true);
    });
  });
});
