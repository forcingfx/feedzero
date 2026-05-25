/**
 * Resolve the User-Agent the proxy sends upstream.
 *
 * Two routes, two profiles:
 *
 *   - `feed` (default) — recurring feed-XML fetches. Sends the FeedZero
 *     identifier so upstream operators can see aggregator traffic in
 *     their logs and contact us if needed.
 *   - `page` — one-off, user-initiated article-page fetches (`/api/page`
 *     for full-text extraction). Sends a browser-like UA because
 *     Cloudflare-class WAFs block the FeedZero identifier on sight when
 *     it appears on an article URL (page traffic isn't expected to come
 *     from a bot the way feed traffic is). Without this, extraction on
 *     sites like kottke.org and zeit.de silently fails — the upstream
 *     returns a 200 with a challenge page that Defuddle can't extract.
 *
 * Precedence, applied to both routes:
 *
 *   1. `FEED_USER_AGENT` env — operator's explicit choice. Wins everywhere.
 *   2. `routeKind === "page"` — browser UA (per above).
 *   3. `SELF_HOSTED=1` — browser UA. Rationale: a self-host instance
 *      represents a single user, not a fleet, so a browser UA is an
 *      honest description of the request profile. Self-hosters were
 *      hitting WAF blocks on the FeedZero UA where the hosted Vercel
 *      deployment wasn't, because Vercel's IP reputation moots the
 *      UA-based blocks. See feedback #97.
 *   4. Default — the FeedZero identifier.
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

export type ProxyRouteKind = "feed" | "page";

export function pickUserAgent(
  env: Record<string, string | undefined>,
  routeKind: ProxyRouteKind = "feed",
): string {
  const explicit = env.FEED_USER_AGENT;
  if (explicit && explicit.length > 0) return explicit;
  if (routeKind === "page") return BROWSER_USER_AGENT;
  if (env.SELF_HOSTED === "1") return BROWSER_USER_AGENT;
  return DEFAULT_USER_AGENT;
}
