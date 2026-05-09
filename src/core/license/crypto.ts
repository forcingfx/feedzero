/**
 * Crypto primitives shared by `sign.ts` and `verify.ts`.
 *
 * Web Crypto API only — no Node-specific imports — so the same code runs in
 * the browser (when verifying license claims client-side), Vercel serverless
 * functions (Node 20+), and the Hono standalone server.
 */

/** HMAC-SHA256 of `message` under `secret`. Returns the raw signature bytes. */
export async function hmacSha256(
  message: string,
  secret: string,
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );
  return new Uint8Array(signature);
}

/** RFC 4648 §5 base64url encoding (no padding). Accepts a string or bytes. */
export function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * RFC 4648 §5 base64url decoding (handles missing padding).
 * Returns "" on malformed input rather than throwing — verify.ts treats
 * malformed tokens as invalid signatures, not errors.
 */
export function base64UrlDecodeToString(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);
  try {
    return atob(b64);
  } catch {
    return "";
  }
}
