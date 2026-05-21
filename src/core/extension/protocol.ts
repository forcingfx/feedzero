/**
 * Wire protocol between the FeedZero web app and the FeedZero browser
 * extension. All transport is window.postMessage scoped to the page's own
 * origin; the extension's content script bridges to its background service
 * worker. No HTTP, no FeedZero server involvement, no credential storage.
 */

import { err, ok, type Result } from "../../utils/result.ts";

export const PROTOCOL_VERSION = 1;

const PING_TIMEOUT_MS = 200;

type OutboundEnvelope<TType extends string> = {
  type: TType;
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
};

export type PingMessage = OutboundEnvelope<"feedzero/ping">;
export type OutboundMessage = PingMessage;

export type PingResponse = {
  type: "feedzero/ping-response";
  requestId: string;
  extensionVersion: string;
};
export type InboundMessage = PingResponse;

function generateRequestId(): string {
  // randomUUID is part of Web Crypto in all browsers we target. happy-dom
  // provides it too. We avoid a third-party uuid dep for one call site.
  return crypto.randomUUID();
}

/**
 * Send an outbound message to the extension and wait for its matching
 * response. Resolves to err on timeout. Caller-side helpers (ping, etc.)
 * narrow the response type.
 */
function send<TResponse extends InboundMessage>(
  message: OutboundMessage,
  expectedResponseType: TResponse["type"],
  timeoutMs: number,
): Promise<Result<TResponse>> {
  return new Promise((resolve) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener("message", listener);
      clearTimeout(timer);
    };
    const listener = (event: MessageEvent) => {
      // Origin pin is the security boundary. The extension content script
      // posts from this same origin after relaying through the background
      // SW; anything from a different origin (an iframe, e.g.) is ignored.
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== expectedResponseType) return;
      if (data.requestId !== message.requestId) return;
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ok(data as TResponse));
    };
    window.addEventListener("message", listener);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(err("timeout: extension not installed or not responding"));
    }, timeoutMs);
    window.postMessage(message, window.location.origin);
  });
}

/**
 * Probe the extension. Resolves ok with the installed version, or err if the
 * extension is absent or unresponsive within the timeout. Default timeout is
 * short (200ms) so detection doesn't block reader-pane rendering.
 */
export async function ping(
  options: { timeoutMs?: number } = {},
): Promise<Result<{ extensionVersion: string }>> {
  const message: PingMessage = {
    type: "feedzero/ping",
    requestId: generateRequestId(),
    protocolVersion: PROTOCOL_VERSION,
  };
  const result = await send<PingResponse>(
    message,
    "feedzero/ping-response",
    options.timeoutMs ?? PING_TIMEOUT_MS,
  );
  if (!result.ok) return result;
  return ok({ extensionVersion: result.value.extensionVersion });
}
