/**
 * Encode a Uint8Array to a base64 string.
 */
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(binary);
}

/**
 * Decode a base64 string to a Uint8Array.
 */
export function base64ToUint8Array(base64: string): Uint8Array {
  if (base64 === "") return new Uint8Array(0);
  const binary = atob(base64);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
