# ADR 024: Signal Briefings — Bring-Your-Own LLM Key

## Status

Accepted (2026-05-24). Amended (2026-05-24) to relay through
`/api/briefing` after browser-direct calls failed in iOS Safari — see
"Amendment: WebKit forced a relay" at the end.

## Context

Signal Briefings is FeedZero's first feature that involves an external LLM
call. The job-to-be-done: a B2B professional (legal, policy, competitive
intelligence) writes a standing prompt and gets back an AI-written briefing
with citations drawn from their own subscribed feeds. The briefing is
versioned, persisted, and auto-flagged "refresh available" when new
matching articles arrive.

FeedZero's charter is unusually strict:

- **Privacy first.** "No data leaves the browser unless the user initiates it."
- **No telemetry, no analytics, no external calls except explicit user actions.**
- **No behavioural analytics or per-user metering server-side** (ADR 012).
- Zero-knowledge sync: the FeedZero server can never read decrypted user data.

Any feature that summarises the user's articles necessarily sends content to
some external service. The architectural question is: *which service, and who
holds the key?*

Three shapes were considered:

| Option | LLM call from | Who pays | FeedZero server sees |
|--------|---------------|----------|----------------------|
| A. Server-proxied (Pro-paid) | FeedZero edge → Anthropic | FeedZero | prompt + article content |
| B. **BYO key, browser-direct** | user's browser → Anthropic | user | nothing |
| C. Both — server default, BYO override | mixed | mixed | sometimes |

## Decision

We ship **Option B: bring-your-own Claude API key, browser-direct.**

- The user pastes their own Anthropic API key in Settings → Briefings.
- The key is encrypted at rest in the vault (same envelope as feed
  content; HMAC-hashed index fields) and syncs to other devices via the
  zero-knowledge sync vault.
- The Anthropic SDK is invoked from the browser with
  `dangerouslyAllowBrowser: true`. The only outbound call is from the
  user's tab to `api.anthropic.com`, authenticated with the key the
  user supplied.
- **The FeedZero server never sees the prompt, the article content, or
  the resulting briefing.** There is no `/api/briefing` endpoint.
- The call happens only when the user clicks "Refresh briefing." The
  auto-refresh hook bumps a `staleArticleCount` so the sidebar can
  show a "refresh available" dot, but it never invokes the LLM.

Gated to Personal+ tier via the canonical tier matrix (`signal-briefings`
entry). The original plan landed at Pro; we moved it down because Pro
currently has no other shipped exclusive features and the friction is
worth eating to get the AI surface in front of more paying users. See
"Why Personal, not Pro" below.

### Why not server-proxied (Option A)

It would require either:

1. **Per-user metering** — the server would need to count tokens per
   account to bill or rate-limit. That stores a user-correlated metric
   server-side, which the privacy charter explicitly rejects (ADR 012:
   "process on device, encrypt at rest with keys the operator cannot
   read, no behavioural analytics").
2. **Trust-the-operator metering with no visibility** — we eat the
   token cost ourselves. That's an open-ended margin risk on a Pro tier
   priced around feature value, not inference volume, and it
   incentivises the operator to either rate-limit aggressively (bad UX)
   or read the calls (catastrophic to the charter).

Either path either lies to the user about privacy or destroys margin.

### Why not "both" (Option C)

Doubles the code surface, splits the security model (one set of users
sends data to FeedZero, another doesn't), and means the privacy
disclosure has to be conditional on a runtime path the user can't see.
The BYO architecture is defensible on its own terms; adding a server
fallback is a v2 question.

### Why Personal, not Pro

Briefings was designed with a B2B persona in mind (legal, policy,
competitive intelligence) and the original tiering put it on Pro to
match. We moved it down to Personal before shipping for two reasons:

1. **Pro currently has no shipped exclusive features.** Search,
   send-to-kindle, authenticated-fetchers, and themes-commercial are
   all coming-soon. Briefings was going to be the only present-value
   reason to choose Pro, which makes Pro hard to sell ("pay more for
   the same things plus a roadmap").
2. **Discovery beats segmentation.** BYO-key is already friction; the
   most useful thing for the feature is exposure to users who'll
   actually try it. Personal-tier hobbyists with a Claude account are
   a real cohort, and a Personal user who finds Briefings indispensable
   is a natural Pro upgrade later when Pro has its own anchor features.

The cap (10 saved briefings) and the BYO-key requirement are the same
on both tiers; if the two tiers later diverge here, the matrix carries
the per-tier limit and `checkBriefingQuota` reads it directly.

### Privacy disclosure

The Settings → Briefings panel, the new-briefing dialog, and the
Refresh button each carry a one-line disclosure of the data flow:
**"Your articles are sent to Anthropic when you click Refresh.
FeedZero never sees your prompts or articles."**

The privacy-sensitive operation is explicit, user-initiated, and
clearly attributed to a third party (Anthropic).

### What the LLM call carries

- The briefing's prompt (free-text user input).
- The top-K (default 30) articles matched against the prompt by the
  local IDF matcher — id, title, author, source URL, and a 1500-char
  excerpt of the article body.
- No user identifier, no FeedZero account state, no other articles.

The matcher pre-filter is the cost-and-privacy control: a corpus of
2,000 articles never gets sent in full.

### Local gate before any LLM call

The orchestrator (`refreshBriefingFlow`) refuses to call the LLM when:

- No API key is stored (`reason: "no-api-key"`).
- The corpus is empty (`reason: "no-articles"`).
- The local signal score is below `BRIEFING_MIN_SCORE = 15`
  (`reason: "not-enough-evidence"`).

The third case is the most important from a privacy + cost perspective:
a thin corpus would produce a low-quality briefing anyway, and we
shouldn't ship the user's articles off-device for a result they
won't trust.

## Consequences

- **Discoverability cost.** A user without an Anthropic key sees an
  empty Briefings page with a "Paste a key in Settings" splash. The
  Settings tab explains how, but the friction is real.
- **No usage analytics.** We cannot tell how many users actually run
  briefings, against what prompts, or with what frequency. That's
  consistent with the rest of the product but worth naming — the
  research-and-iterate loop relies on user feedback rather than
  telemetry.
- **The key lives in the vault.** Vault breach → key exposure. The
  vault is zero-knowledge; the only realistic compromise is the user's
  passphrase, which is also what compromises every other piece of their
  data. Risk is bounded by the same control as the rest of the product.
- ~~**`@anthropic-ai/sdk` lands in the SPA bundle** (~50KB gzipped).~~
  Obsolete; see amendment below. The SDK is no longer a dependency.

## Amendment: WebKit forced a relay

**Date:** 2026-05-24 (same day as the original ADR, after first user
test on iPad Safari.)

### What broke

The browser-direct architecture failed in WebKit. Every iOS browser
(Safari + every iOS Chrome/Firefox/Brave, all WebKit by Apple
mandate), and desktop Safari, rejected the fetch to
`api.anthropic.com/v1/messages` with the generic "Load failed" — no
JS-level detail, but the pattern fingerprints clearly:

- Anthropic returns `access-control-allow-origin: *` AND
  `access-control-allow-credentials: true` AND sets a Cloudflare
  `_cfuvid` cookie on the response. The first two together are a
  CORS-spec violation (the spec rejects `*` when credentials are
  involved), and Safari is stricter about enforcing it than Chrome.
- Even when the SDK doesn't ask for credentials, Safari's ITP
  classifies the third-party cookie + permissive CORS combo as
  cross-site tracking and silently blocks the response.

This isn't a bug we can fix — the failure is between Anthropic's CORS
config and WebKit's tracking-prevention policy.

### What we changed

Added `POST /api/briefing` as a same-origin relay that forwards the
browser's request to Anthropic verbatim. The user's API key transits
the relay as the `x-api-key` header and Anthropic's response flows
back unchanged. Same-origin sidesteps CORS entirely.

### Privacy delta

Original promise: "FeedZero never sees your key, your prompts, or
your articles."

New promise: "FeedZero's relay forwards your key + briefing payload
on every Refresh. The relay does not persist, log, or inspect the
payload — body bytes flow upstream, response bytes flow back, neither
is touched."

This is materially weaker. The user has to trust the operator not to
log. The same trust model already applies to `/api/feedback` (text
forwarded to GitHub), but the value-at-stake is higher here (an API
key with billable usage). The trade-off is reach: without the relay
the entire iOS audience can't use Briefings; with it everyone can.

Self-hosters can audit the handler at
`src/core/briefings/briefing-proxy-handler.ts` — it's ~80 lines, no
logging, fetch-and-forward only.

### Why not the alternatives

- **"Ship desktop-only with a 'not yet supported on iOS' splash."**
  Considered. FeedZero's mobile audience is overwhelmingly iPad and
  iPhone for the privacy-conscious persona — desktop-only would
  exclude the bullseye user. Rejected.
- **"Add a CORS proxy as a separate service."** Same trust model as
  the relay we built, more moving parts, no win.
- **"Convince Anthropic to fix their CORS config."** Out of our
  control, no ETA, and ITP would likely still flag the response.

### Code consequences

- `@anthropic-ai/sdk` removed as a dependency. The relay is a dumb
  pipe and the SDK was only useful for the constructor-and-class shape
  the relay path doesn't need. Hand-built request body is ~20 lines
  and the request/response shapes are stable.
- ~130KB (34KB gzip) gone from the bundle.
- The "lazy-load the SDK so it doesn't blank the app at boot" gymnastics
  in the previous fix are obsolete; there's no SDK to lazy-load.

## Amendment 2: web-search verified feed suggestions

**Date:** 2026-05-24.

### What changed

The "suggest feeds that could strengthen this briefing" output used to
be model-imagined: Claude wrote URLs from its training-data memory of
publishers, and we ran each through `discoverFeed()` to catch the dead
ones. In practice the discover step rejected most of them — Claude's
guesses at feed paths (`/feed`, `/rss`, `/atom.xml`) are wrong as often
as they're right, and "site X publishes Y" lookups were stale.

Now the model can use Anthropic's server-side `web_search` tool while
generating the briefing, with `max_uses: 5`. The system prompt requires:

> Use web_search to find candidate sources … then verify each candidate
> feed URL with a second targeted search if needed. Do NOT suggest any
> URL you haven't surfaced via web_search; do NOT guess feed paths from
> a model-known site name. If web_search returns nothing usable for a
> particular topic, return FEWER suggestions rather than padding with
> unverified guesses.

The Anthropic backend handles the searches; results stream back into the
same response. We still pipe each candidate through `discoverFeed()` as
defense in depth, but the discovery step now mostly confirms what the
model already verified.

### Cost delta

`web_search` adds ~1¢ per search at current Anthropic pricing; capped at
5 uses per refresh that's 5¢/refresh on top of the ~5¢ base briefing
cost. Paid by the user (BYO key). The structural-section briefing
template forces concise output so token counts don't balloon.

### Why this works with multi-step tool use

`tool_choice` flipped from `{type: "tool", name: "submit_briefing"}` to
`{type: "auto"}` so the model can interleave web_search calls before
the final structured submission. Response parsing now looks for the
`tool_use` block with `name === "submit_briefing"` specifically (rather
than the first `tool_use`) since the response also contains
`server_tool_use` blocks for each search.

## Future work

- **Operator-paid trial.** A future ADR could enable a server-proxied
  free-tier ration of briefings to drive activation, paid out of
  marketing budget and explicitly metered with the privacy cost
  documented. Not now.
- **Embeddings-based matching.** The IDF matcher is the v1 pre-filter;
  if quality issues trace to bad article selection (not bad model
  output), embeddings are the next lever.
- **Multi-LLM support.** The model registry already enumerates Haiku,
  Sonnet, and Opus. Adding non-Anthropic providers requires per-key
  registration and shape-of-output normalisation; deferred until
  there's user demand.
