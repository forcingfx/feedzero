/**
 * Wrapper around `fetch` for sync-related requests.
 *
 * When a license token is stored in localStorage (PR Y), automatically
 * attaches `Authorization: Bearer <token>`. The server-side handler enforces
 * the bearer requirement when LAUNCH_PAID_TIER=1 (PR W); otherwise it's a
 * harmless no-op.
 *
 * Why a wrapper (and not e.g. service-worker request rewriting):
 *  - The 4 sync fetch sites in src/core/sync/sync-service.ts share one
 *    contract: include the Bearer when the user is paid, omit when free.
 *  - A wrapper keeps that policy in ONE file. Changing it (e.g. adding
 *    a request signature, adding a tracing header) touches one place.
 *
 * Caller-supplied Authorization wins. Useful for tests + for unusual
 * flows (e.g. a one-off admin-token request) that must not be silently
 * overridden by the stored license token.
 */

import { getLicenseToken } from "../license/license-token-store";

export async function syncFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  const callerSetAuth = headers.has("Authorization");

  if (!callerSetAuth) {
    const token = getLicenseToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(input, { ...init, headers });
}
