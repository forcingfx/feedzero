import { isFlagEnabled } from "../flags/flags";

/**
 * HTTP methods the health endpoint supports.
 *
 * Used by routing contract tests to enforce the three-entry-point rule:
 * Hono server, Vite dev proxy, and the Vercel api/health.ts wrapper must all
 * agree on which methods are exposed.
 */
export const SUPPORTED_METHODS: readonly string[] = ["GET"];

/**
 * Body of a healthy response. Kept tiny on purpose — uptime monitors should
 * be cheap to parse and easy to alert on.
 */
interface HealthBody {
  ok: boolean;
  version: string;
  time: string;
  maintenance?: boolean;
}

/**
 * Resolve the build-identifying version string.
 *
 * Tries Vite's build-time injected `VITE_APP_VERSION` first, then a Node-side
 * fallback so this works in Hono / Vercel without Vite. Returns "unknown" so
 * a missing env never crashes the health endpoint — degraded info beats a
 * 500 on the one URL meant to tell you the server is up.
 *
 * TODO(observability): replace with a build-time constant injected by the
 * Vite/Vercel build (and Sentry release tag) once that wiring lands.
 */
function resolveVersion(): string {
  const viteVersion = readViteAppVersion();
  if (viteVersion) return viteVersion;
  return process.env.APP_VERSION ?? "unknown";
}

/**
 * Reads `import.meta.env.VITE_APP_VERSION` without making this module fail
 * to load in plain Node (where `import.meta.env` is undefined).
 */
function readViteAppVersion(): string | undefined {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> })
      .env;
    return env?.VITE_APP_VERSION;
  } catch {
    return undefined;
  }
}

/**
 * Builds a JSON Response with `Cache-Control: no-store`.
 *
 * Health responses must never be cached — uptime monitors and operators need
 * the live state of the process, not what the CDN saw five minutes ago.
 */
function jsonHealthResponse(body: HealthBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Build identity: same version + timestamp returned regardless of flag state.
 * Operators want this even in a maintenance response so they can confirm
 * which build they are looking at.
 */
function currentBuildIdentity(): Pick<HealthBody, "version" | "time"> {
  return {
    version: resolveVersion(),
    time: new Date().toISOString(),
  };
}

/**
 * Health endpoint handler.
 *
 * - 200 with `{ ok: true, version, time }` when serving normally.
 * - 503 with `{ ok: false, version, time, maintenance: true }` when the
 *   MAINTENANCE_MODE kill switch is enabled. The 503 distinguishes "we know
 *   we are down" from "the world is on fire" (which would surface as a
 *   timeout or 5xx from the platform).
 *
 * @param _request - Web standard Request. Currently unused; reserved so the
 *                   signature matches the other shared handlers and so future
 *                   diagnostics (per-region, request-id) have a place to land.
 */
export function handleHealthRequest(_request: Request): Response {
  const identity = currentBuildIdentity();

  if (isFlagEnabled("MAINTENANCE_MODE")) {
    return jsonHealthResponse(
      { ok: false, maintenance: true, ...identity },
      503,
    );
  }

  return jsonHealthResponse({ ok: true, ...identity }, 200);
}
