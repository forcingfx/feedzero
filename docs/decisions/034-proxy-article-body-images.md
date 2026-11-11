# ADR 034: Article-Body Images Load Through the Image Proxy

## Status
Accepted (2026-11-11).

## Context

Feeds and full-text pages are fetched through FeedZero's proxy, so a
publisher sees the server's address, not the reader's. Favicons and list
thumbnails already loaded through `/api/icon`. Images inside an opened
article did not: the reader rendered the stored HTML, and the browser
fetched each `<img src>` straight from the publisher's host. That request
carries the reader's IP address. The document-wide
`Referrer-Policy: no-referrer` (vercel.json, server.ts) already kept the
Referer out, so the IP address was the remaining leak.

A second leak sat in `src/lib/content-modes.ts`. It measured article HTML
with `document.createElement("div").innerHTML = html`. An element owned by
the live document starts fetching its images as soon as the HTML is
parsed, attached or not. That ran on every article open, before the
reader body rendered, so the publisher saw the reader even for images the
reader never scrolled to.

## Decision

### Rewrite at render time, in one component

`ArticleContent` is the only component that renders article-body HTML. It
serves feed content and extracted full text, on desktop and in the mobile
reader layer. Before DOMPurify runs, it calls `proxyArticleImages(html,
articleUrl)` (`src/core/proxy/proxy-article-images.ts`):

- Every `<img src>` with an `http:` or `https:` URL becomes
  `/api/icon?url=<encoded>&mode=article`. Relative paths resolve against
  the article's URL first, which also fixes relative images that used to
  resolve against FeedZero's own origin and break.
- `srcset`, `sizes` and `<picture><source>` are removed. Each candidate
  would be another direct load, and the proxied `src` shows the image.
- `data:` URIs are left alone; they load nothing from the network.
- DOMPurify runs last, on the rewritten HTML.

Render time, not ingest time, because content is stored encrypted in
IndexedDB. Rewriting at ingest would leave every stored article leaking
until a migration decrypted and rewrote it, and would bake the proxy URL
into synced vault data. At render time old and new articles are covered
the same way, and changing the proxy URL later needs no migration.

Any code that inspects article HTML must parse it inertly with
`DOMParser` (as `content-modes.ts` now does), never through
`innerHTML` on a live-document element.

### One route, a larger cap for article mode

The Vercel deployment already has 12 functions, so article images share
`/api/icon`. `src/core/proxy/icon-route.ts` is the single dispatcher that
all three entry points call:

| Query | Handler | Cap | Server memory cache |
| --- | --- | --- | --- |
| `?domain=<host>` | favicon discovery | (favicon handler) | no |
| `?url=<image>` | favicon or list thumbnail | 2 MB | yes (self-host, dev) |
| `?url=<image>&mode=article` | article-body image | 4 MiB | no |

The article cap is 4 MiB because a Vercel Function cannot return a
response body above 4.5 MB. A higher cap would only buffer images the
function then fails to send. Thumbnails keep 2 MB because rows ask for
them automatically while scrolling, so their cost stays bounded. A client
can always request article mode, so 4 MiB is the real upper bound per
request. Every existing guard applies to both modes: SSRF validation,
image-only relaying (415 for anything else), the per-request size check,
and the rule that the proxy never logs target URLs.

Article images skip the server's in-memory feed cache. They are large and
per-article, and the cache's per-URL request counter would otherwise
record which images readers open. The browser HTTP cache serves repeats
through the existing `Cache-Control: public, max-age=86400,
stale-while-revalidate=604800` on image responses.

## Consequences

- **Bandwidth cost.** Every article image now passes through a Vercel
  Function twice (in from the publisher, out to the reader). Long-form
  articles with many large photographs cost function duration and data
  transfer that used to be the publisher's. The CDN can cache responses
  (`public, max-age=86400`), so repeat views of a popular article are
  cheaper, but the first view of each image is billed. Watch Fast Data
  Transfer and function duration on `/api/icon` after release.
- **Images above 4 MiB break.** They answer 413 and render as a broken
  image. Very large hero images and uncompressed PNGs are the likely
  cases.
- **Hosts that block server fetches break.** Some image hosts refuse
  requests without a browser Referer or from datacenter IP ranges
  (hotlink protection). Those images rendered before and now fail.
- **No responsive variants.** Dropping `srcset` means high-density
  screens get the publisher's default `src`, which may be lower
  resolution. Ingest already removed `srcset`, so stored content rarely
  had it.
- **Self-hosters** relay images through their own server, so the
  publisher sees the self-host server's address. On a home server that
  can still be the reader's own IP (see the threat model).

## Alternatives considered

- **Rewrite at ingest.** Rejected: needs a migration of encrypted stored
  content and writes proxy URLs into synced vaults.
- **A new `/api/image` function.** Rejected for now: the deployment is at
  12 functions, and one dispatcher shared by three entry points is less
  drift-prone than a fourth route.
- **Raise the shared cap to 4 MiB.** Rejected: list thumbnails would then
  relay up to 4 MiB per row while scrolling.
- **`referrerpolicy="no-referrer"` on direct loads.** Not enough: it
  hides the Referer but not the IP address, and the document policy
  already hides the Referer.
