import { handleProxyRequest } from "../src/core/proxy/proxy-handler.ts";

/**
 * Vercel serverless function for proxying RSS/Atom/JSON feed requests.
 * Endpoint: /api/feed?url=<encoded-feed-url>
 *
 * This bypasses CORS restrictions by fetching feeds server-side.
 * Includes SSRF protections to block internal/private IP addresses.
 */
export default async function handler(req: Request): Promise<Response> {
  return handleProxyRequest(req, "text/xml");
}
