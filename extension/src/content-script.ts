/// <reference types="chrome" />

/**
 * Content script. Injected into the FeedZero page at document_start.
 * Bridges window.postMessage (the page's transport with the extension)
 * to chrome.runtime.sendMessage (the in-process transport with the
 * background service worker).
 *
 * Security: the origin pin in the listener restricts which window can
 * originate a request. The manifest's content_scripts.matches restricts
 * which pages this script runs on. Both must agree.
 */

window.addEventListener("message", async (event: MessageEvent) => {
  if (event.origin !== window.location.origin) return;
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (typeof msg.type !== "string") return;
  if (!msg.type.startsWith("feedzero/")) return;
  if (msg.type.endsWith("-response")) return; // ignore our own posts back to page

  try {
    const response = await chrome.runtime.sendMessage(msg);
    if (response) {
      window.postMessage(response, window.location.origin);
    }
  } catch {
    // If the background SW is asleep or the message can't be delivered,
    // the page's ping() simply times out — which is the right UX
    // (treat as "extension not responding"). No need to surface here.
  }
});
