import { resolveIconUrl } from "./favicon-resolver.ts";
import {
  FAVICON_FETCH_TIMEOUT_MS,
  FAVICON_USER_AGENT,
} from "./favicon-http.ts";
import { validateProxyUrl } from "../proxy/validate-url.ts";

/**
 * Handle favicon discovery requests. Takes a domain, resolves the best
 * favicon URL, fetches the image, and returns it.
 *
 * Query params:
 *   ?domain=example.com — the site to find a favicon for
 */
export async function handleFaviconRequest(
  req: Request,
): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return new Response("Missing domain parameter", { status: 400 });
  }

  const origin = `https://${domain}`;
  const validation = validateProxyUrl(origin);
  if (!validation.ok) {
    return new Response(validation.error, { status: 400 });
  }

  try {
    const iconUrl = await resolveIconUrl(origin);

    const res = await fetch(iconUrl, {
      headers: { "User-Agent": FAVICON_USER_AGENT },
      signal: AbortSignal.timeout(FAVICON_FETCH_TIMEOUT_MS),
    });

    if (!res.ok) {
      return new Response("Favicon not found", { status: 404 });
    }

    const body = await res.arrayBuffer();
    const contentType =
      res.headers.get("content-type") || "image/x-icon";

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        // Favicons are extremely stable per-domain — a publisher
        // changes theirs once every year or two at most. Cache for
        // 24h with a week-long stale-while-revalidate so a returning
        // visitor's browser HTTP cache satisfies the request without
        // re-hitting the server. Before this commit the explicit
        // `no-cache` here forced a round-trip on every page load,
        // wasting one request per unique feed domain per session
        // (≥ 20 requests for a typical sidebar refresh).
        "Cache-Control":
          "public, max-age=86400, stale-while-revalidate=604800",
      },
    });
  } catch {
    return new Response("Favicon fetch failed", { status: 502 });
  }
}
