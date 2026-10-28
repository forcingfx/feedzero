/**
 * Compute a weak ETag for a stored payload. SHA-256 truncated to the
 * first 16 hex characters (64 bits) — collision risk is negligible at
 * one ETag per vault per change, and the short form keeps headers
 * compact. Weak validator (W/"…") because the server may re-serialize
 * structurally-equivalent JSON; the bytes match only the byte-shape
 * stored, not the semantic content.
 *
 * Shared by the handler (response headers) and adapters that store the
 * ETag next to the vault so a conditional pull can skip the vault read.
 */
export async function etagOf(data: string): Promise<string> {
  const bytes = new TextEncoder().encode(data);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `W/"${hex}"`;
}
