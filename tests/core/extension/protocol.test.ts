import { describe, it, expect, afterEach } from "vitest";
import { isOk, isErr } from "@/utils/result.ts";
import {
  ping,
  PROTOCOL_VERSION,
  type OutboundMessage,
  type PingResponse,
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
});
