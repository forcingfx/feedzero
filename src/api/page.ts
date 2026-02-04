/**
 * Vercel Serverless Function: Page Proxy
 *
 * Proxies web page requests for full-text extraction.
 * Delegates to the shared proxy handler with SSRF protection.
 */
import { handleProxyRequest } from "../core/proxy/proxy-handler.ts";

export async function GET(req: Request): Promise<Response> {
  return handleProxyRequest(req, "text/html");
}
