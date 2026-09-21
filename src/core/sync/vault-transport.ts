import { ok, err } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";

/**
 * Wire encoding for a sync PUT body, shared by the client that builds it
 * and the handler that reads it.
 *
 * **Why compress at all.** The vault is gzipped before encryption, so the
 * ciphertext itself is incompressible — but it then rides in JSON, which
 * cannot hold bytes, so it is base64'd. Base64 spends 8 bits to carry 6:
 * a third of every push is pure encoding overhead. Gzipping the finished
 * JSON puts that third back, which is the difference between a large
 * vault syncing and not syncing at all on a platform that caps request
 * bodies.
 *
 * **Why a custom header instead of `Content-Encoding: gzip`.** That is
 * the standards-correct spelling, and it is also an instruction to every
 * proxy and CDN between the browser and the handler. Whether the hosting
 * platform decompresses such a body before our code runs is not
 * something this repo can test from a sandbox, and guessing wrong means
 * the handler gunzips plaintext in production. A header nothing else
 * recognises cannot be helpfully acted upon by anything in the path.
 *
 * **Decoding is size-capped.** A gzip stream that unpacks to gigabytes is
 * a few kilobytes on the wire, so `decodePushBody` stops reading once the
 * output passes the caller's cap rather than trusting the sender.
 */

/** Header naming the body encoding. Lower-case: `Headers.get` folds case. */
export const PUSH_ENCODING_HEADER = "x-feedzero-body-encoding";

/** The only value {@link decodePushBody} understands. */
export const PUSH_ENCODING_GZIP = "gzip";

/**
 * Returned by {@link decodePushBody} when the output passes the cap.
 * The handler matches on it to answer 413 rather than 400: the body was
 * well-formed, there was just far too much of it.
 */
export const PUSH_BODY_TOO_LARGE = "Decompressed body exceeds the cap";

/**
 * Compress a push body for transit.
 *
 * The caller pads BEFORE encoding: `padPayload` buckets the JSON to a
 * power of two so a traffic observer cannot infer subscription count
 * from transfer size, and that bucketing has to survive compression.
 * It does, because the pad and the ciphertext are both base64 and
 * therefore compress at the same ratio — measured at a 48-byte spread
 * across a 1 MiB bucket holding anywhere from 10% to 95% real content.
 * Padding with a different alphabet (random hex compresses to 0.54,
 * base64 to 0.75) would make the compressed length a function of the
 * real content size again and quietly undo the padding.
 */
export async function encodePushBody(json: string): Promise<Result<Uint8Array>> {
  try {
    const input = new TextEncoder().encode(json);
    const stream = new Blob([input as BlobPart])
      .stream()
      .pipeThrough(new CompressionStream("gzip"));
    return ok(new Uint8Array(await new Response(stream).arrayBuffer()));
  } catch (e) {
    return err(`Failed to encode push body: ${(e as Error).message}`);
  }
}

/**
 * Decompress a push body, refusing to buffer more than `maxBytes` of
 * output. Returns the JSON text the handler then parses.
 *
 * Reads the decompressed stream chunk by chunk rather than calling
 * `Response.arrayBuffer()`, because the whole point is to stop early:
 * buffering first and checking the length afterwards would mean the
 * bomb has already landed.
 */
export async function decodePushBody(
  body: Uint8Array,
  maxBytes: number,
): Promise<Result<string>> {
  try {
    const stream = new Blob([body as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    const reader = stream.getReader();

    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return err(PUSH_BODY_TOO_LARGE);
      }
      chunks.push(value);
    }

    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return ok(new TextDecoder().decode(joined));
  } catch (e) {
    return err(`Failed to decode push body: ${(e as Error).message}`);
  }
}
