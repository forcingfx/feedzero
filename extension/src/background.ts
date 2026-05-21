/// <reference types="chrome" />

/**
 * Background service worker (MV3). Receives messages relayed from the page
 * via the content script and dispatches to the pure handlers in
 * ./handlers.ts. Keeps no state of its own beyond the manifest version.
 */

import { handleMessage } from "./handlers.ts";

const extensionVersion = chrome.runtime.getManifest().version;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const response = handleMessage(message, { extensionVersion });
  // sendResponse closes the message channel synchronously when given a value;
  // returning false signals we will not respond asynchronously.
  sendResponse(response);
  return false;
});
