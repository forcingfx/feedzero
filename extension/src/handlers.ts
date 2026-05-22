/**
 * Pure message handlers for the extension's background service worker.
 * Extracted from background.ts so they can be unit-tested without faking
 * the whole chrome.runtime / chrome.permissions / fetch surface — all
 * external IO is injected via HandlerContext.
 *
 * Phase 1 ships ping. Phase 2 adds fetch-article: the cross-origin fetch
 * with the user's session that powers reading paywalled content. Paywall
 * detection and content extraction stay on the web-app side; this handler
 * is pure transport.
 */

const PROTOCOL_VERSION = 1;

type PingMessage = {
  type: "feedzero/ping";
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
};

type FetchArticleMessage = {
  type: "feedzero/fetch-article";
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  url: string;
};

type AuthorizePublisherMessage = {
  type: "feedzero/authorize-publisher";
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
  domain: string;
};

type PingResponse = {
  type: "feedzero/ping-response";
  requestId: string;
  extensionVersion: string;
};

type FetchArticleResponse =
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

type AuthorizePublisherResponse = {
  type: "feedzero/authorize-publisher-response";
  requestId: string;
  granted: boolean;
};

export type InboundFromPage =
  | PingMessage
  | FetchArticleMessage
  | AuthorizePublisherMessage;
export type OutboundToPage =
  | PingResponse
  | FetchArticleResponse
  | AuthorizePublisherResponse;

export type HandlerContext = {
  extensionVersion: string;
  /**
   * Fetch a URL using whatever credential context the runtime provides.
   * In production this is a thin wrapper around `fetch(url, { credentials:
   * "include" })` that resolves the response text and final URL. In tests
   * it's a mock so the pure handler stays IO-free.
   */
  fetchUrl: (
    url: string,
  ) => Promise<{ html: string; finalUrl: string; status: number }>;
  /**
   * Whether the extension has the host permission needed to fetch from
   * `origin` with credentials. Backed by chrome.permissions.contains in
   * production. We check first so we can return a precise reason instead
   * of an opaque network failure.
   */
  hasPermission: (origin: string) => Promise<boolean>;
  /**
   * Request a runtime host permission for `origin`. Backed by
   * chrome.permissions.request, which surfaces Chrome's native host-permission
   * dialog. Resolves true on Allow, false on Deny / dismissal / runtime error.
   * MV3 requires this to be called in response to a user gesture; the page
   * sends the authorize-publisher message in direct response to a click.
   */
  requestPermission: (origin: string) => Promise<boolean>;
};

/**
 * Build the response to a page-originated message. Resolves to null when
 * the message is not addressed to this extension (caller should ignore).
 */
export async function handleMessage(
  message: unknown,
  context: HandlerContext,
): Promise<OutboundToPage | null> {
  if (!isInboundFromPage(message)) return null;
  if (message.protocolVersion !== PROTOCOL_VERSION) return null;
  switch (message.type) {
    case "feedzero/ping":
      return {
        type: "feedzero/ping-response",
        requestId: message.requestId,
        extensionVersion: context.extensionVersion,
      };
    case "feedzero/fetch-article":
      return await handleFetchArticle(message, context);
    case "feedzero/authorize-publisher":
      return await handleAuthorizePublisher(message, context);
  }
}

async function handleFetchArticle(
  message: FetchArticleMessage,
  context: HandlerContext,
): Promise<FetchArticleResponse> {
  const origin = parseOriginOrNull(message.url);
  if (!origin) {
    return {
      type: "feedzero/fetch-article-response",
      requestId: message.requestId,
      ok: false,
      reason: "blocked-scheme",
    };
  }
  const allowed = await context.hasPermission(origin);
  if (!allowed) {
    return {
      type: "feedzero/fetch-article-response",
      requestId: message.requestId,
      ok: false,
      reason: "no-permission",
    };
  }
  try {
    const result = await context.fetchUrl(message.url);
    return {
      type: "feedzero/fetch-article-response",
      requestId: message.requestId,
      ok: true,
      html: result.html,
      finalUrl: result.finalUrl,
      status: result.status,
    };
  } catch {
    return {
      type: "feedzero/fetch-article-response",
      requestId: message.requestId,
      ok: false,
      reason: "network-error",
    };
  }
}

async function handleAuthorizePublisher(
  message: AuthorizePublisherMessage,
  context: HandlerContext,
): Promise<AuthorizePublisherResponse> {
  const denied: AuthorizePublisherResponse = {
    type: "feedzero/authorize-publisher-response",
    requestId: message.requestId,
    granted: false,
  };
  if (!isBareHost(message.domain)) return denied;
  const origin = `https://${message.domain}`;
  try {
    const granted = await context.requestPermission(origin);
    return {
      type: "feedzero/authorize-publisher-response",
      requestId: message.requestId,
      granted,
    };
  } catch {
    return denied;
  }
}

/**
 * A bare host has no scheme, no path, no query — just `nytimes.com` or
 * `cooking.nytimes.com`. We refuse anything else so the permission scope
 * stays explicit and predictable when chrome.permissions.request expands
 * `https://${host}/*`.
 */
function isBareHost(value: string): boolean {
  if (!value) return false;
  if (value.includes("/")) return false;
  if (value.includes(":")) return false;
  if (value.includes("?")) return false;
  if (value.includes("#")) return false;
  if (value.includes(" ")) return false;
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(value);
}

function parseOriginOrNull(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}

function isInboundFromPage(value: unknown): value is InboundFromPage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== "string") return false;
  if (!v.type.startsWith("feedzero/")) return false;
  if (v.type.endsWith("-response")) return false;
  if (typeof v.requestId !== "string") return false;
  if (typeof v.protocolVersion !== "number") return false;
  // Message-type-specific shape checks.
  if (v.type === "feedzero/fetch-article" && typeof v.url !== "string") {
    return false;
  }
  if (
    v.type === "feedzero/authorize-publisher" &&
    typeof v.domain !== "string"
  ) {
    return false;
  }
  return true;
}
