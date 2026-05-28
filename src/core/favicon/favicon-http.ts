/**
 * Shared HTTP policy for favicon discovery and download.
 *
 * Keeping these in one module means changing the User-Agent or tuning a
 * timeout touches a single line, instead of three sites that have to be
 * kept in sync by hand. The two distinct timeouts reflect a deliberate
 * policy difference between discovery probes (cheap, many) and the image
 * download (single, may be larger).
 */

/** Identifies FeedZero on every outbound favicon request. */
export const FAVICON_USER_AGENT = "FeedZero/1.0 (RSS Reader)";

/**
 * Upper bound for a single discovery probe (HEAD on a well-known path,
 * or HTML fetch for `<link rel="icon">` parsing). Kept tight because
 * resolution walks several probes before falling back to DuckDuckGo —
 * a slow site shouldn't stall the whole chain.
 */
export const FAVICON_PROBE_TIMEOUT_MS = 5_000;

/**
 * Upper bound for the actual icon image download served by the favicon
 * proxy. Longer than the probe budget because the bytes are real (apple-
 * touch-icon variants can run >100 KB) and there is no follow-up step
 * to fall through to once we have committed to a URL.
 */
export const FAVICON_FETCH_TIMEOUT_MS = 10_000;
