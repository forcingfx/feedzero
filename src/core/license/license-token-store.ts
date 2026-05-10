/**
 * License token persistence in browser localStorage.
 *
 * The license token is the user's proof of paid status. They get it via
 * email after Stripe Checkout completes (post-launch — for now, manually
 * via the admin issue endpoint). They paste it into the app and it lives
 * in localStorage from then on.
 *
 * Why localStorage (not IndexedDB / encrypted vault):
 *  - The token is a Bearer credential — needs to be readable synchronously
 *    by every fetch call to /api/sync.
 *  - Already encrypted-by-design (HMAC-signed; impossible to forge without
 *    LICENSE_SIGNING_KEY) so localStorage's lack of encryption is acceptable.
 *  - Cross-tab same-origin behavior: localStorage is shared, which is what
 *    we want (the user paid once; all open tabs get sync access).
 *
 * Defensive validation: only persist values that look like our token format
 * (`fz_<base64url>.<base64url>`). A copy-paste of "Subject: Welcome to
 * FeedZero" should not silently land in localStorage as the user's token.
 */

export const LICENSE_TOKEN_STORAGE_KEY = "feedzero:license-token";

const TOKEN_PREFIX = "fz_";

/**
 * Read the stored token. Returns null when:
 *   - No token has been stored
 *   - The stored value doesn't pass validation (defensive — protects against
 *     downgrade attacks where an attacker writes garbage to localStorage)
 */
export function getLicenseToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LICENSE_TOKEN_STORAGE_KEY);
  if (!raw) return null;
  if (!isWellFormedToken(raw)) return null;
  return raw;
}

/**
 * Persist a token. Whitespace-trims (paste-from-email frequently picks up
 * trailing newlines). Empty/invalid input clears the slot rather than
 * leaving stale state.
 */
export function setLicenseToken(token: string): void {
  if (typeof localStorage === "undefined") return;
  const trimmed = token.trim();
  if (!trimmed || !isWellFormedToken(trimmed)) {
    localStorage.removeItem(LICENSE_TOKEN_STORAGE_KEY);
    return;
  }
  localStorage.setItem(LICENSE_TOKEN_STORAGE_KEY, trimmed);
}

/** Remove the stored token. Used on explicit user action (logout/clear). */
export function clearLicenseToken(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LICENSE_TOKEN_STORAGE_KEY);
}

/** Cheap presence check for UI gating (e.g. "show Subscribe vs Manage"). */
export function hasLicenseToken(): boolean {
  return getLicenseToken() !== null;
}

/**
 * Shape check, NOT cryptographic verification. The server is the only thing
 * that can cryptographically verify a token (it has LICENSE_SIGNING_KEY).
 * This guard prevents obviously-wrong values from polluting the store.
 */
function isWellFormedToken(value: string): boolean {
  if (!value.startsWith(TOKEN_PREFIX)) return false;
  const body = value.slice(TOKEN_PREFIX.length);
  const parts = body.split(".");
  if (parts.length !== 2) return false;
  return parts[0].length > 0 && parts[1].length > 0;
}
