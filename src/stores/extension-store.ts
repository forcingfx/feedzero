/**
 * Tracks the FeedZero browser extension's presence and per-publisher
 * authorization grants from the web app's perspective. The actual permission
 * state lives in chrome.permissions inside the extension; this store mirrors
 * the subset the page needs to render the paywall-prompt UI without
 * round-tripping the extension on every component render.
 *
 * Note: the mirror is best-effort. A user can revoke a host permission via
 * chrome://extensions and we would not see it. That's acceptable because the
 * next authenticated fetch returns reason: "no-permission" and the reader
 * pane re-prompts. See ADR 020 for why we keep the extension as the canonical
 * permission store.
 */

import { create } from "zustand";
import {
  ping,
  authorizePublisher as authorizePublisherProtocol,
} from "../core/extension/protocol.ts";

export type ExtensionStatus = "unknown" | "installed" | "absent";

interface ExtensionState {
  status: ExtensionStatus;
  extensionVersion: string | null;
  /** Domains the user has granted host permission for in this browser. */
  authorizedDomains: string[];
  /** When non-null, a request for this domain is currently in flight. */
  authorizationInFlight: string | null;
  /** Probe for the extension. Updates `status` + `extensionVersion`. */
  detect: () => Promise<void>;
  /**
   * Prompt the user (via chrome.permissions.request inside the extension) for
   * host permission on `domain`. Resolves true if granted, false otherwise.
   * On grant the domain is appended to `authorizedDomains` and is deduped.
   */
  requestPublisherAccess: (domain: string) => Promise<boolean>;
  /** O(n) but n is the number of publishers the user reads — tiny. */
  isAuthorized: (domain: string) => boolean;
}

export const useExtensionStore = create<ExtensionState>((set, get) => ({
  status: "unknown",
  extensionVersion: null,
  authorizedDomains: [],
  authorizationInFlight: null,

  detect: async () => {
    const result = await ping();
    if (result.ok) {
      set({
        status: "installed",
        extensionVersion: result.value.extensionVersion,
      });
    } else {
      set({ status: "absent", extensionVersion: null });
    }
  },

  requestPublisherAccess: async (domain) => {
    set({ authorizationInFlight: domain });
    try {
      const result = await authorizePublisherProtocol(domain);
      if (!result.ok || !result.value.granted) {
        return false;
      }
      const current = get().authorizedDomains;
      if (!current.includes(domain)) {
        set({ authorizedDomains: [...current, domain] });
      }
      return true;
    } finally {
      // Clear the flag whether the request resolved, rejected, or threw.
      // Leaving it set would prevent a re-prompt after a transient failure.
      if (get().authorizationInFlight === domain) {
        set({ authorizationInFlight: null });
      }
    }
  },

  isAuthorized: (domain) => get().authorizedDomains.includes(domain),
}));
