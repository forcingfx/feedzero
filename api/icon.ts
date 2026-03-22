/**
 * Vercel Serverless Function: Favicon Proxy
 *
 * Proxies favicon requests to prevent IP leakage to feed publishers.
 * Delegates to the shared proxy handler with SSRF protection.
 */
import { handleProxyRequest } from "../src/core/proxy/proxy-handler.ts";

export async function GET(req: Request): Promise<Response> {
  return handleProxyRequest(req, "image/x-icon");
}
