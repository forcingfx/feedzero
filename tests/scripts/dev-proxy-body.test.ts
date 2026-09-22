import { describe, it, expect } from "vitest";
import { Readable } from "node:stream";
import { toWebRequest } from "../../scripts/dev-proxy.js";

/**
 * The dev proxy is the third consumer of the shared API handlers, after
 * the Hono server and the Vercel functions, and it is the one every
 * `npm run dev` session and every E2E run goes through.
 *
 * It converts a Node request into a Web `Request`, and that conversion
 * is a place where bytes can quietly stop being bytes: decoding a body
 * as UTF-8 text turns every invalid sequence into U+FFFD, which is
 * lossy for anything that is not text. Sync pushes are gzipped, so a
 * text round-trip corrupts them — with the handler reporting a
 * malformed body and nothing pointing at the proxy that mangled it.
 */

function fakeNodeRequest(body: Uint8Array, headers: Record<string, string>) {
  const stream = Readable.from([Buffer.from(body)]) as Readable & {
    method: string;
    url: string;
    headers: Record<string, string>;
  };
  stream.method = "PUT";
  stream.url = "/api/sync";
  stream.headers = headers;
  return stream;
}

describe("dev proxy body conversion", () => {
  it("passes a binary body through byte for byte", async () => {
    // Bytes that are not valid UTF-8 — exactly what a gzip stream looks
    // like, starting with its 0x1f 0x8b magic.
    const body = new Uint8Array([
      0x1f, 0x8b, 0x08, 0x00, 0xff, 0xfe, 0xc3, 0x28, 0x80, 0x81, 0x00,
    ]);

    const request = await toWebRequest(
      fakeNodeRequest(body, { "content-type": "application/octet-stream" }),
    );
    const received = new Uint8Array(await request.arrayBuffer());

    expect(Array.from(received)).toEqual(Array.from(body));
  });

  it("still carries a JSON body unchanged", async () => {
    const json = JSON.stringify({ vaultId: "a".repeat(64) });
    const request = await toWebRequest(
      fakeNodeRequest(new TextEncoder().encode(json), {
        "content-type": "application/json",
      }),
    );
    expect(await request.text()).toBe(json);
  });

  it("forwards the headers the handler dispatches on", async () => {
    const request = await toWebRequest(
      fakeNodeRequest(new Uint8Array([1, 2, 3]), {
        "x-feedzero-body-encoding": "gzip",
      }),
    );
    expect(request.headers.get("x-feedzero-body-encoding")).toBe("gzip");
  });
});
