/**
 * Resolve the User-Agent the proxy sends to upstream feeds.
 *
 * Three configurations, in precedence order:
 *
 *   1. `FEED_USER_AGENT` — operator's explicit choice. Wins unconditionally.
 *   2. `SELF_HOSTED=1`   — return a browser-like UA. Rationale: a
 *      self-host instance represents a single user, not a fleet, so a
 *      browser UA is an honest description of the request profile. The
 *      `FeedZero/1.0 (RSS Reader)` identifier is fingerprintable and
 *      blocked on sight by some WAFs — self-hosters were hitting this
 *      where the hosted Vercel deployment wasn't, because Vercel's IP
 *      reputation moots the UA-based blocks. See feedback #97.
 *   3. Default — the FeedZero identifier so upstream operators can see
 *      our traffic in their logs and contact us if needed.
 *
 * Pure function — environment is passed in — so tests cover all branches
 * without process.env mutation.
 */
export const DEFAULT_USER_AGENT = "FeedZero/1.0 (RSS Reader)";

/**
 * A modern Firefox UA. Chosen over a "FeedZero (compatible; Mozilla)"
 * hybrid because some WAFs flag any UA mentioning a non-browser product
 * name as bot traffic regardless of the rest of the string.
 */
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";

export function pickUserAgent(
  env: Record<string, string | undefined>,
): string {
  const explicit = env.FEED_USER_AGENT;
  if (explicit && explicit.length > 0) return explicit;
  if (env.SELF_HOSTED === "1") return BROWSER_USER_AGENT;
  return DEFAULT_USER_AGENT;
}
