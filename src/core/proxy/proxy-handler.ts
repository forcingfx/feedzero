import { validateProxyUrl } from "./validate-url.ts";

/**
 * Shared proxy logic for serverless functions.
 * Validates the target URL, fetches it, and returns the response.
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
