/**
 * Vercel Serverless Function: Feed Proxy
 *
 * Proxies RSS/Atom/JSON feed requests to bypass CORS restrictions.
 * Delegates to the shared proxy handler with SSRF protection.
 */
import { handleProxyRequest } from "../core/proxy/proxy-handler.ts";

export async function GET(req: Request): Promise<Response> {
  return handleProxyRequest(req, "text/xml");
}
