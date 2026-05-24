# ADR 024: Signal Briefings — Bring-Your-Own LLM Key

## Status

Accepted (2026-05-24).

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

Gated to Pro tier via the canonical tier matrix (`signal-briefings` entry).

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
- **`@anthropic-ai/sdk` lands in the SPA bundle** (~50KB gzipped). It's
  imported only by the briefing-client module, which is itself imported
  only via the route-split briefing-page chunk, so it doesn't load
  until the user navigates to `/briefings`.

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
