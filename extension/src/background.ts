/// <reference types="chrome" />

/**
 * Background service worker (MV3). Receives messages relayed from the page
 * via the content script and dispatches to the pure handlers in
 * ./handlers.ts. Provides the runtime-side IO (fetch, permission check)
 * that the handlers depend on via context injection.
 */

import { handleMessage } from "./handlers.ts";

const extensionVersion = chrome.runtime.getManifest().version;

/**
 * Fetch a URL the way a logged-in user's browser would: credentials
 * included, the user's normal UA. We deliberately do not set custom
 * headers that would mark this as bot traffic.
 */
async function fetchUrl(
  url: string,
): Promise<{ html: string; finalUrl: string; status: number }> {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow",
  });
  const html = await response.text();
  return { html, finalUrl: response.url, status: response.status };
}

/**
 * Check whether the user has authorized the extension for `origin`. Backed
 * by chrome.permissions.contains so this reflects live grants made via
 * chrome.permissions.request (the "Authorize <domain>" UX from the page).
 */
async function hasPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`${origin}/*`] });
}

/**
 * Prompt the user to grant host permission for `origin`. Chrome shows its
 * native confirmation dialog; resolves true on Allow, false on Deny or
 * dismissal. MV3 requires the call to happen inside a user-gesture stack —
 * the page sends the authorize-publisher message in direct response to a
 * click on the "Authorize <domain>" button.
 */
async function requestPermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Async response pattern: returning true keeps the message channel open
  // until sendResponse is called.
  handleMessage(message, {
    extensionVersion,
    fetchUrl,
    hasPermission,
    requestPermission,
  })
    .then((response) => sendResponse(response))
    .catch(() => sendResponse(null));
  return true;
});
