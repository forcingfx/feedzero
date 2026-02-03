import { validateProxyUrl } from "./validate-url.js";

/**
 * Shared proxy logic for serverless functions.
 * Validates the target URL, fetches it, and returns the response.
 *
 * Used by:
 * - Vercel serverless functions (api/feed.ts, api/page.ts) in production
 * - Vite dev server middleware (vite.config.js) in development
 *
 * @param req - The incoming request with ?url=<target> query parameter
 * @param defaultContentType - Fallback content type if upstream doesn't provide one
 * @returns Response with proxied content or error message
 */
export async function handleProxyRequest(
  req: Request,
  defaultContentType: string,
): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const target = url.searchParams.get("url");

  const validation = validateProxyUrl(target);
  if (!validation.ok) {
    const status =
      validation.error === "Access to internal addresses is blocked"
        ? 403
        : 400;
    return new Response(validation.error, { status });
  }

  try {
    const response = await fetch(validation.value.href);
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
