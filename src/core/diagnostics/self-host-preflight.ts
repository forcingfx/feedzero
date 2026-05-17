/**
 * Self-host preflight diagnostic.
 *
 * Runs a sequence of cheap checks to verify the deployment is wired
 * correctly. Designed so a self-hoster gets a single "all checks passed"
 * or a specific list of remediable failures, not a generic boot error.
 *
 * Currently checks:
 *   1. secure-context  — Web Crypto requires it; the most common
 *                        self-host mistake (see feedback #88).
 *   2. crypto-subtle   — exposed by the browser.
 *   3. api-feed        — POST /api/feed roundtrip; verifies the proxy
 *                        wrapper is wired.
 *   4. api-sync        — HEAD /api/sync; verifies sync routes mounted.
 *
 * Pure dependencies: environment and `fetch` are injected. Tests cover
 * every branch without touching network or globalThis.
 *
 * Designed to be safe to invoke from any UI surface and from smoke
 * tests against a live deployment.
 */

export interface PreflightEnv {
  isSecureContext: boolean;
  crypto: Pick<Crypto, "subtle"> | undefined;
  fetch: typeof fetch;
  origin: string;
  /**
   * Optional probe URL for the /api/feed check. Defaults to the FeedZero
   * release feed because it is small, public, and not subject to user
   * rate-limits.
   */
  probeFeedUrl?: string;
}

export interface PreflightCheck {
  id: "secure-context" | "crypto-subtle" | "api-feed" | "api-sync";
  passed: boolean;
  detail: string;
}

export interface PreflightReport {
  allPassed: boolean;
  checks: PreflightCheck[];
}

const DEFAULT_PROBE_FEED = "https://feedzero.app/releases.xml";

export async function runSelfHostPreflight(
  env: PreflightEnv,
): Promise<PreflightReport> {
  const checks: PreflightCheck[] = [
    {
      id: "secure-context",
      passed: env.isSecureContext,
      detail: env.isSecureContext
        ? "Loaded over HTTPS or localhost."
        : `Insecure context (${env.origin}). Web Crypto unavailable — put TLS in front.`,
    },
    {
      id: "crypto-subtle",
      passed: !!env.crypto?.subtle,
      detail: env.crypto?.subtle
        ? "Web Crypto API exposed."
        : "Web Crypto API unavailable. Browser may be in Lockdown Mode.",
    },
    await probe(env, "api-feed", () =>
      env.fetch(new URL("/api/feed", env.origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: env.probeFeedUrl ?? DEFAULT_PROBE_FEED }),
      }),
    ),
    await probe(env, "api-sync", () =>
      env.fetch(new URL("/api/sync?vaultId=preflight", env.origin), {
        method: "HEAD",
      }),
    ),
  ];

  return { allPassed: checks.every((c) => c.passed), checks };
}

async function probe(
  _env: PreflightEnv,
  id: "api-feed" | "api-sync",
  doFetch: () => Promise<Response>,
): Promise<PreflightCheck> {
  try {
    const response = await doFetch();
    // 2xx, 3xx, or "4xx that means 'reachable but no resource'" all
    // count as "endpoint is wired". A 404 on `api-sync` with a probe
    // vaultId is the expected response — the server is alive and
    // routing correctly. Treat 5xx as failures.
    const passed = response.status < 500;
    return {
      id,
      passed,
      detail: passed
        ? `Reachable (HTTP ${response.status}).`
        : `Server error (HTTP ${response.status}).`,
    };
  } catch (e) {
    return {
      id,
      passed: false,
      detail: `Unreachable: ${(e as Error).message}`,
    };
  }
}
