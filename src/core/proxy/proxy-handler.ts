import { validateProxyUrl } from "./validate-url.ts";

/**
 * Shared proxy logic for serverless functions.
 * Validates the target URL, fetches it, and returns the response.
 */
export async function handleProxyRequest(
  req: Request,
  defaultContentType: string,
): Promise<Response> {
  const target = await extractTargetUrl(req);

  const validation = validateProxyUrl(target);
  if (!validation.ok) {
    const status =
      validation.error === "Access to internal addresses is blocked"
        ? 403
        : 400;
    return new Response(validation.error, { status });
  }

  try {
    const response = await fetch(validation.value.href, {
      headers: { "User-Agent": "FeedZero/1.0 (RSS Reader)" },
    });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || defaultContentType,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return new Response(`Proxy error: ${message}`, { status: 502 });
  }
}

/** Extract target URL from POST body (preferred) or GET query param (fallback). */
async function extractTargetUrl(req: Request): Promise<string | null> {
  if (req.method === "POST") {
    try {
      const body = (await req.json()) as { url?: string };
      return body.url ?? null;
    } catch {
      return null;
    }
  }
  const url = new URL(req.url, "http://localhost");
  return url.searchParams.get("url");
}
