import { handleProxyRequest } from "../src/core/proxy/proxy-handler";

export default async function handler(req: Request): Promise<Response> {
  return handleProxyRequest(req, "text/html");
}
