# ADR 028: Remove Content-Heuristic Paywall Detection

## Status

Accepted (2026-06-04). Amends [ADR 020](020-browser-extension-surface.md).

## Context

Feature 019 (authenticated full-text fetching) shipped a content-heuristic
paywall detector in `src/core/extractor/paywall-detectors/`. It inspected the
fetched page HTML and flagged an article as paywalled when either:

- the body matched an industry-wide or per-publisher "Subscribe to read" /
  "Already a subscriber?" phrase list (`default-detector`, `nytimes`,
  `economist`), or
- the visible text was shorter than a 600-character threshold
  (`body-too-short`, via `visible-text.ts`).

The heuristic was unreliable in the direction that hurts most: **false
positives on free articles.** Many free articles ship the exact phrases the
detector keyed on in their nav/footer/newsletter chrome (Wired, NYT, lttlabs,
…). Issue #211 was filed when fully-readable free articles rendered a "Paywalled
article" prompt instead of their content. The #211 fix layered an
"extract-first, only consult heuristics on a thin result" guard on top — adding
complexity to compensate for a signal that was guessing in the first place.

A phrase list is a guess about another company's HTML. It needs per-publisher
upkeep ("publishers change paywall HTML twice a year"), and every guess is a
chance to gate a free article. Meanwhile there is a signal that is not a guess:
when a publisher refuses an anonymous request, it returns a gated HTTP status
(401 Unauthorized, 402 Payment Required, 403 Forbidden, 451). That status is
the publisher *telling us* the content is gated.

## Decision

Remove the content-heuristic detectors entirely. Recognize a paywall **only**
from a gated HTTP status (401/402/403/451) on the anonymous `/api/page` fetch.

- Delete `src/core/extractor/paywall-detectors/` (default/nytimes/economist
  detectors, the registry, `visible-text.ts`, `detectPaywall`, and the
  `PaywallDetector` interface).
- Keep the small, certain pieces — the `PaywallVerdict` shape and
  `publisherHost()` — in a new `src/core/extractor/paywall.ts`.
- A 200 response is never re-classified as paywalled from its content: whatever
  Defuddle extracts is the article; an empty extraction is a plain failure.
- The extension authenticated-retry path is retained, now triggered by the
  gated status. A retry that still yields no readable article is treated as
  `session-expired` (the cookie has expired) — previously this was a second
  content-heuristic check on the retried HTML; it is now the absence of a
  readable extraction.

The extension plumbing, `paywallMap`, `getPaywallVerdict`, and the reader-pane
`PaywallPrompt` are unchanged.

## Consequences

**Positive**

- No more false positives from page chrome — the #211 class of bug is gone by
  construction, and the extract-first guard it required is removed too.
- Zero per-publisher upkeep. HTTP status needs no phrase lists; adding a
  publisher is mostly verifying its anonymous fetch is gated and its
  authenticated retry extracts.
- Less code and a smaller bundle (eight detector modules + their tests removed).

**Negative / accepted trade-offs**

- A publisher that serves a *200 with a paywall stub* (rather than a gated
  status) now reads as an empty extraction → a plain "extraction found nothing"
  failure, not a paywall prompt. We judged the soft-paywall miss less harmful
  than gating free articles, and the reader still offers "Open original".
- `session-expired` is now inferred from a non-extracting authenticated retry
  rather than a positive content match, so a genuinely empty (but free) page
  fetched through the extension would surface the session-expired copy. This
  only occurs on the already-gated path for an authorized publisher.

## References

- Feature 019: `docs/features/019-authenticated-fetch.md`
- ADR 020: `docs/decisions/020-browser-extension-surface.md`
- Issue #211 (free articles wrongly flagged paywalled)
