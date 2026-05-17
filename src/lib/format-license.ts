/**
 * License token display helpers.
 *
 * `maskToken` produces a fixed-width opaque rendering of a `fz_…` token —
 * `fz_••••.••••` with bullet counts derived from the real payload + sig
 * lengths. Same width as the original means no layout jitter when the
 * user toggles reveal/hide.
 */

const TOKEN_PREFIX = "fz_";

export function maskToken(token: string): string {
  if (!token.startsWith(TOKEN_PREFIX)) {
    return "•".repeat(Math.max(token.length, 8));
  }
  const body = token.slice(TOKEN_PREFIX.length);
  const dotIdx = body.indexOf(".");
  if (dotIdx < 0) {
    return TOKEN_PREFIX + "•".repeat(body.length);
  }
  const payloadLen = dotIdx;
  const sigLen = body.length - dotIdx - 1;
  return `${TOKEN_PREFIX}${"•".repeat(payloadLen)}.${"•".repeat(sigLen)}`;
}
