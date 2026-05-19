import type { ServerResponse } from "node:http";

/**
 * Structural subset of Node IncomingMessage that {@link toWebRequest} actually reads.
 * Defined narrowly here so test fakes (and any future caller) only need to
 * satisfy what the function uses, not the full Node type surface.
 */
export interface IncomingMessageLike extends AsyncIterable<Buffer> {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
}

export function toWebRequest(req: IncomingMessageLike): Promise<Request>;
export function sendWebResponse(
  webRes: Response,
  res: ServerResponse,
): Promise<void>;
