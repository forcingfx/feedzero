# ADR 027: Web Worker for feed parsing and content extraction

## Status

Proposed, 2026-05-28. Not implemented in this commit — the
implementation has real edge cases (DOMPurify in worker context,
Comlink boundary cost, error propagation, test harness) that warrant
their own focused session.

## Context

Three CPU-bound paths run on the main thread today and noticeably
block on mobile:

1. **Feed parse** — `src/core/parser/parser.ts` (feedsmith over XML
   blobs). A refresh of 30 feeds with 100 articles each parses ~3MB
   of XML in series on tab return. Visible jank.
2. **Sanitize** — `src/core/parser/sanitizer.ts` (DOMPurify on
   article HTML). Runs on every parsed article and again on every
   full-text extraction. The expensive piece is the DOM construction
   DOMPurify does internally.
3. **Extract** — `src/core/extractor/defuddle-extractor.ts` and
   `src/core/extractor/cleanup.ts`. Defuddle parses + walks an entire
   article page; cleanup runs another DOM pass.

A refresh on mid-tier Android (where many privacy-conscious users
live) can block the main thread for 1-3 seconds. The FSM fix earlier
in this thread surfaces this honestly via the busy badge, but the
fix doesn't make it faster — it just makes it visible.

A Web Worker would move all three off the main thread. The UI keeps
rendering during refresh; the badge spinner spins smoothly; new
articles pop in as each completes rather than freezing the page until
they all do.

## Decision (proposed)

Move parse, sanitize, and extract into a single Web Worker.

### Why one worker, not three

Each path produces input for the next: parse → sanitize → store, and
extract → sanitize → store. Splitting them across workers means three
serialization boundaries (postMessage cost) per article instead of
one. Single worker keeps the data inside the worker for the whole
pipeline.

### Why Comlink

The three modules already export pure functions
(`parse(text, url) → Result<ParsedFeed>`, `sanitize(html) → string`,
`extract(html, url) → Result<ExtractedContent>`). Comlink wraps them
as `Promise`-returning RPC stubs with zero changes to the core modules.
Native `postMessage` would require hand-rolled request/response
correlation per call.

```ts
// src/workers/parse-extract-worker.ts
import * as Comlink from "comlink";
import { parse } from "@/core/parser/parser";
import { sanitize } from "@/core/parser/sanitizer";
import { extract } from "@/core/extractor/extractor";

const api = { parse, sanitize, extract };
Comlink.expose(api);
export type ParseExtractAPI = typeof api;

// src/workers/parse-extract-client.ts
import * as Comlink from "comlink";
import type { ParseExtractAPI } from "./parse-extract-worker";

const worker = new Worker(
  new URL("./parse-extract-worker.ts", import.meta.url),
  { type: "module" },
);
export const parseExtract = Comlink.wrap<ParseExtractAPI>(worker);
```

Existing callers of `parse`/`sanitize`/`extract` swap their import
from `src/core/parser/...` → `src/workers/parse-extract-client.ts`.
The function signatures stay identical except for becoming Promise-
returning where they weren't already.

### Why not all of core

Sync, crypto, key derivation, encryption — these are also CPU-bound
but each one is short (sub-100ms) and runs once or twice per session.
Moving them to a worker is unnecessary complexity. The three named
above are the high-frequency, high-cost paths.

## Edge cases to nail before landing

These are the things that will bite a sloppy migration. The ADR
spells them out so the implementation isn't re-discovering them.

### 1. DOMPurify needs a window-like global

DOMPurify constructs a DOM internally. In a worker there is no
`window`. The library *does* support custom JSDOM-like objects via
`createDOMPurify(window)`. The migration must:

- Import `jsdom` (or `linkedom` — smaller, faster, fewer features)
- Construct a DOMPurify instance with the linkedom window inside the
  worker
- Verify the allowlist of tags/attrs is preserved (lock with a
  parity test against the main-thread version on the same input)

### 2. Feedsmith dependencies on `DOMParser`

Some feedsmith strategies fall back to `DOMParser`. Workers don't
have `DOMParser`. Either:
- Use feedsmith's "no DOM" path (verify it exists; if not, use a
  fast XML parser like `fast-xml-parser` in worker, and reserve
  feedsmith for main-thread fallback on weird feeds)
- Ship a linkedom-based DOMParser shim into the worker

The right path becomes obvious after a parity test against the
existing feed corpus.

### 3. Comlink wrapping `Result<T>`

`Result` is `{ ok: true, value } | { ok: false, error }`. Comlink
preserves plain objects across the boundary as long as they're
structured-cloneable. Confirm with a test that an error result
returned from the worker arrives intact on the main thread (vs
becoming a rejected promise via Comlink's "thrown errors" path).

### 4. Worker boot time vs cold-cache parse

Spinning up the worker takes ~50ms. For the first refresh in a
session, that's added latency. The right shape: lazy-init the worker
on the first call, not on app boot. Subsequent calls reuse the
loaded worker.

### 5. Error backtraces cross the boundary

Errors thrown in the worker arrive on the main thread with their
stack truncated at the postMessage boundary. The existing logging
(via `Result.err`) sidesteps this for expected errors, but unexpected
throws lose context. Capture worker-side via Comlink's
`transferHandlers` to wrap stacks.

### 6. Hot-reload in dev

Vite's HMR doesn't reload workers when the worker source changes.
The dev experience needs a manual page reload after every worker
edit. Document this in CLAUDE.md if it lands; the alternative is
custom HMR for workers, which is more friction than it buys.

## Why proposed only (this commit)

The migration is multi-day work, not afternoon-polish:

1. linkedom-or-jsdom evaluation against the existing test corpus
2. Worker-side DOMPurify instance + parity test
3. feedsmith worker compatibility check (might require a parser swap)
4. Comlink integration tests including `Result` round-trip + error
   propagation
5. Per-caller migration (5+ call sites across feed-service,
   extraction-store, prefetch-service)
6. Mobile performance measurement before/after (otherwise we shipped
   complexity without proving the win)

Doing this carelessly produces silent extraction failures and broken
sanitization — both privacy-critical regressions for a tool whose
target audience is journalists and activists. Better to write the
plan now and execute it deliberately than to ship a half-done worker
in the same session that already refactored boot, state, and tests.

## Consequences

### When implemented

- Mobile refresh feels snappy (UI stays interactive)
- Briefing extraction stops blocking the briefing UI
- A class of "OOM on huge feed" bugs moves into the worker's memory
  budget instead of the main tab's

### Migration tax

- +1 dep (Comlink, ~7KB) + linkedom (~80KB worker-only)
- +1 hot-reload friction in dev
- Test harness for worker tests (Vitest supports this via
  `@vitest/web-worker`)

### Anti-goals

- We do NOT propose a worker for crypto / key derivation. Web Crypto
  is already non-blocking via its own threading. Adding a worker
  wrapper buys nothing.
- We do NOT propose moving sync push/pull into a worker. The
  network's already async; the JSON serialization is small.

## References

- `src/core/parser/parser.ts` / `sanitizer.ts` / `src/core/extractor/`
  — the three modules to migrate
- Comlink docs: https://github.com/GoogleChromeLabs/comlink
- linkedom comparison: https://github.com/WebReflection/linkedom
  (smaller alternative to jsdom)
- Vitest worker support:
  https://vitest.dev/guide/web-workers (test harness pattern)
