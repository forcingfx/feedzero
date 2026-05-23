import { ok, err, type Result } from "../../../packages/core/src/utils/result";

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
]);

const BLOCKED_PREFIXES = ["10.", "192.168."];

/** Checks if hostname is in the 172.16.0.0/12 range (172.16.x.x – 172.31.x.x). */
function isPrivate172(hostname: string): boolean {
  const match = hostname.match(/^172\.(\d+)\./);
  if (!match) return false;
  const octet = parseInt(match[1], 10);
  return octet >= 16 && octet <= 31;
}

/**
 * Extracts the embedded IPv4 address from an IPv6-mapped address.
 * Handles both dotted-decimal (::ffff:1.2.3.4) and hex (::ffff:102:304) forms,
 * since URL parsers normalize to hex.
 */
function extractMappedIPv4(hostname: string): string | null {
  // Dotted-decimal form: ::ffff:1.2.3.4
  const dotted = hostname.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (dotted) return dotted[1];

  // Hex form: ::ffff:7f00:1 (URL parser output)
  const hex = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hex) {
    const high = parseInt(hex[1], 16);
    const low = parseInt(hex[2], 16);
    return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
  }

  return null;
}

/** Checks if a dotted-decimal IPv4 address is private or reserved. */
function isPrivateIPv4(ip: string): boolean {
  return (
    BLOCKED_HOSTNAMES.has(ip) ||
    BLOCKED_PREFIXES.some((prefix) => ip.startsWith(prefix)) ||
    isPrivate172(ip)
  );
}

/**
 * Validates a URL for proxying: checks for presence, allowed protocols,
 * and blocks internal/private addresses (SSRF protection).
 *
 * Blocks IPv6-mapped IPv4 addresses (::ffff:x.x.x.x) to prevent bypass
 * of private IP blocklists.
 */
export function validateProxyUrl(url: string | null | undefined): Result<URL> {
  if (!url) {
    return err("Missing url parameter");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err("Invalid URL");
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return err("Only http and https URLs are allowed");
  }

  const rawHostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const ipToCheck = extractMappedIPv4(rawHostname) ?? rawHostname;

  if (isPrivateIPv4(ipToCheck)) {
    return err("Access to internal addresses is blocked");
  }

  return ok(parsed);
}
