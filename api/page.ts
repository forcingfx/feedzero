import { handleProxyRequest } from "../src/core/proxy/proxy-handler.js";

/**
 * Vercel serverless function for proxying web page requests.
 * Endpoint: /api/page?url=<encoded-page-url>
 *
 * Used for full-text article extraction (fetches HTML for Defuddle processing).
 * Includes SSRF protections to block internal/private IP addresses.
 */
export default async function handler(req: Request): Promise<Response> {
  return handleProxyRequest(req, "text/html");
}
