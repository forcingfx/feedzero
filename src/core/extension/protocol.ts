/**
 * Wire protocol between the FeedZero web app and the FeedZero browser
 * extension. All transport is window.postMessage scoped to the page's own
 * origin; the extension's content script bridges to its background service
 * worker. No HTTP, no FeedZero server involvement, no credential storage.
 */

import { err, ok, type Result } from "../../utils/result.ts";

export const PROTOCOL_VERSION = 1;

const PING_TIMEOUT_MS = 200;
const FETCH_TIMEOUT_MS = 30_000;

type OutboundEnvelope<TType extends string> = {
  type: TType;
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
};

export type PingMessage = OutboundEnvelope<"feedzero/ping">;
export type FetchArticleMessage = OutboundEnvelope<"feedzero/fetch-article"> & {
  url: string;
};
export type OutboundMessage = PingMessage | FetchArticleMessage;

export type PingResponse = {
  type: "feedzero/ping-response";
  requestId: string;
  extensionVersion: string;
};

/**
 * The extension's reply for a fetch-article request. `ok: true` carries the
 * raw HTML the extension received with the user's session; the web app then
 * runs paywall detection + Defuddle on it. `ok: false` reasons are
 * extension-side failures only — paywall detection is the web app's job.
 */
export type FetchArticleResponse =
  | {
      type: "feedzero/fetch-article-response";
      requestId: string;
      ok: true;
      html: string;
      finalUrl: string;
      status: number;
    }
  | {
      type: "feedzero/fetch-article-response";
      requestId: string;
      ok: false;
      reason: "no-permission" | "network-error" | "blocked-scheme";
    };

export type InboundMessage = PingResponse | FetchArticleResponse;

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

/**
 * Ask the extension to fetch the given URL using the user's existing
 * session for that origin. The extension returns the raw HTML; paywall
 * detection and content extraction stay on the web-app side.
 *
 * Caller is responsible for first ensuring the extension has been authorized
 * for the URL's origin (Phase 3 — `authorize-publisher` flow). When that's
 * missing, the extension returns `ok: false, reason: "no-permission"` and
 * the reader pane should show the "Authorize <domain>" prompt.
 */
export async function fetchArticle(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<Result<{ html: string; finalUrl: string; status: number }>> {
  const message: FetchArticleMessage = {
    type: "feedzero/fetch-article",
    requestId: generateRequestId(),
    protocolVersion: PROTOCOL_VERSION,
    url,
  };
  const result = await send<FetchArticleResponse>(
    message,
    "feedzero/fetch-article-response",
    options.timeoutMs ?? FETCH_TIMEOUT_MS,
  );
  if (!result.ok) return result;
  const response = result.value;
  if (!response.ok) return err(response.reason);
  return ok({
    html: response.html,
    finalUrl: response.finalUrl,
    status: response.status,
  });
}
