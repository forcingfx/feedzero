/**
 * Pure message handlers for the extension's background service worker.
 * Extracted from background.ts so they can be unit-tested without faking
 * the whole chrome.runtime surface.
 *
 * Phase 1 covers only the ping handler; the fetch-article handler will
 * land alongside paywall detection in Phase 2.
 */

const PROTOCOL_VERSION = 1;

type PingMessage = {
  type: "feedzero/ping";
  requestId: string;
  protocolVersion: typeof PROTOCOL_VERSION;
};

type PingResponse = {
  type: "feedzero/ping-response";
  requestId: string;
  extensionVersion: string;
};

export type InboundFromPage = PingMessage;
export type OutboundToPage = PingResponse;

/**
 * Build the response to a page-originated message. Returns null when the
 * message is not addressed to this extension (caller should ignore).
 */
export function handleMessage(
  message: unknown,
  context: { extensionVersion: string },
): OutboundToPage | null {
  if (!isInboundFromPage(message)) return null;
  if (message.protocolVersion !== PROTOCOL_VERSION) return null;
  switch (message.type) {
    case "feedzero/ping":
      return {
        type: "feedzero/ping-response",
        requestId: message.requestId,
        extensionVersion: context.extensionVersion,
      };
  }
}

function isInboundFromPage(value: unknown): value is InboundFromPage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.type === "string" &&
    v.type.startsWith("feedzero/") &&
    !v.type.endsWith("-response") &&
    typeof v.requestId === "string" &&
    typeof v.protocolVersion === "number"
  );
}
