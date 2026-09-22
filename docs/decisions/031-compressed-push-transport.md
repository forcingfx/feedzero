# ADR 031: Compress the Sync Push Body in Transit

## Status
Accepted (2026-09-21).

## Context

A user's vault reached 4.2 MB and stopped syncing. The ceiling shipped
the day before (ADR-less, in the 413 fix) was 4 MiB, chosen as a
conservative margin under Vercel's documented 4.5 MB edge limit — so the
guard, not the platform, was refusing a body the platform would probably
have accepted. Raising the ceiling to sit just under 4.5 MB would have
bought that user roughly 96 KB: a handful of articles, days.

The real waste was visible in the payload itself. The vault is gzipped
*before* encryption, so the ciphertext is incompressible. It then rides
in JSON, which cannot carry bytes, so it is base64'd — 8 bits spent to
carry 6. A third of every push was encoding overhead, and that third was
the difference between syncing and not.

Three options were weighed: raise the ceiling and stop (a band-aid that
fails again within days), chunked upload (removes the ceiling, but
changes the adapter atomicity contract of ADR 017 and touches all three
entry points), or reclaim the base64 overhead.

## Decision

**Gzip the push body in transit, and keep the stored format byte-identical.**

- `encodePushBody` / `decodePushBody` (`src/core/sync/vault-transport.ts`)
  are the two sides of the agreement; a contract test drives the real
  handler with the real client's bytes.
- The handler decompresses **before** storing. The stored string, its
  ETag, and every GET are exactly what they were, so a device running an
  older build still pulls the vault, and the handler still accepts an
  uncompressed PUT from one. No migration, no version negotiation.
- The signal is a custom header, `x-feedzero-body-encoding: gzip`, not
  `Content-Encoding: gzip`. The standards spelling is also an instruction
  to every proxy and CDN in the path, and whether the hosting platform
  decompresses such a body before our code runs is not something this
  repo can verify from a sandbox. Guessing wrong means gunzipping
  plaintext in production. A header nothing else recognises cannot be
  helpfully acted upon.
- Decoding is size-capped at `MAX_VAULT_SIZE` and the handler answers
  413 past it. A gzip stream that unpacks to gigabytes is kilobytes on
  the wire; without the cap, accepting compressed bodies would be handing
  any client a memory-exhaustion primitive.
- The ceiling rose to 4.3 MB of *compressed* bytes, which is roughly
  5.7 MB of vault JSON — about a 40% increase in what actually fits.

## The padding coupling

`padPayload` buckets the JSON to a power of two so a traffic observer
cannot infer subscription count from transfer size. Once the body is
compressed, what an observer measures is the compressed length, so the
pad has to compress at the same ratio as the ciphertext it hides.

Random hex compresses to 0.54. Base64 compresses to 0.75. A hex pad
around base64 ciphertext would have made the compressed size a function
of the real content again — the padding would have kept running, kept
passing its tests, and stopped protecting anyone.

So the pad is random **base64**. Measured: a 1 MiB bucket holding
anywhere from 10% to 95% real content lands within 48 bytes of the same
wire size. This is the kind of coupling that survives only if it is
written down and tested, so it is both.

## Consequences

- The wire format changed, so anything that inspected a PUT body had to
  change with it. The cross-device test had re-implemented the handler's
  body parsing in its fetch mock; it now calls the real handler, which is
  what the Tier 1.5 rule asked for in the first place.
- `MAX_VAULT_SIZE` is no longer "the storage limit" but "the
  decompressed limit", doubling as the bomb cap. Three constants now
  govern three different quantities; the feature doc tabulates them.
- A self-hosted deployment must serve a handler that understands the
  header before its clients send it. In this project they ship in the
  same image, so the ordering takes care of itself.
- **The dev proxy had to learn that bodies are bytes.** `toWebRequest`
  in `scripts/dev-proxy.js` built its Web `Request` from
  `Buffer.concat(chunks).toString()`, which replaces every invalid UTF-8
  sequence with U+FFFD. That is harmless for JSON and destroys a gzip
  stream, so the change broke `npm run dev` and the E2E sync specs while
  Hono and Vercel — both of which hand the handler a real `Request` —
  were fine. This is the three-entry-point rule biting in its quietest
  form: the entry points did not need *updating*, one of them was simply
  wrong about what a body is. `tests/scripts/dev-proxy-body.test.ts`
  pins the byte-for-byte contract now.
- The saving is a constant factor, not a fix for unbounded growth. A
  vault that grows past ~5.7 MB of JSON still stops syncing, and chunked
  upload remains the only thing that removes the ceiling rather than
  moving it.

## Alternatives considered

- **Raise the ceiling only.** ~96 KB of headroom for the reporting user.
  Rejected as a band-aid that would produce the same report within days.
- **Send the ciphertext as raw bytes instead of base64.** The same
  saving, but it changes the *stored* envelope, so a device on an older
  build could no longer read a vault written by a new one. Compression
  gets the same bytes back without touching what is at rest.
- **Chunked upload.** The real structural fix, and still available. It
  changes the adapter atomicity contract (a reader must never see a
  half-assembled vault), so it is a larger piece of work than this one
  and was not what the size problem needed first.
