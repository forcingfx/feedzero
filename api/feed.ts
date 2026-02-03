/**
 * Vercel Serverless Function: Feed Proxy
 *
 * Proxies RSS/Atom/JSON feed requests to bypass CORS restrictions.
 * Includes SSRF protection to block internal/private addresses.
 */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "0.0.0.0",
  "169.254.169.254",
]);

const BLOCKED_PREFIXES = ["10.", "192.168.", "172.16."];

interface ValidationResult {
  valid: boolean;
  error?: string;
  parsed?: URL;
}

function validateUrl(url: string | null): ValidationResult {
  if (!url) {
    return { valid: false, error: "Missing url parameter" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "Invalid URL" };
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, error: "Only http and https URLs are allowed" };
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_PREFIXES.some((prefix) => hostname.startsWith(prefix))
  ) {
    return { valid: false, error: "Access to internal addresses is blocked" };
  }

  return { valid: true, parsed };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get("url");

  const validation = validateUrl(targetUrl);
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(validation.parsed!.toString());
    const body = await response.text();

    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/xml",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: "Failed to fetch feed" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
