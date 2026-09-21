# ADR 032: Releasing Offline Copies, and Watching Vault Size Anonymously

## Status
Accepted (2026-09-21).

## Context

ADR 031 bought roughly 40% more room inside the sync ceiling by
compressing the push body. That is a constant factor, not a cure: a
vault keeps growing, and the thing that grows it is persisted offline
full text (`Article.extractedContent`), since `exportVault` already
drops article bodies and everything else is metadata.

Two gaps remained.

**Nothing released that text.** `toggleStar` stripped `starredAt` and
kept `extractedContent`; the per-feed prefetch toggle only stopped new
fetches; no code path anywhere cleared it. For one release the sync
size error told users to unstar articles, which freed exactly zero
bytes. The only real remedy was deleting the feed, which also deletes
its articles.

**Nothing watched the trend.** Vault size was invisible until a user
hit the wall, and the first report of that was a support message.

## Decision

### The app keeps an offline copy for as long as it would re-fetch one

That rule (`src/core/storage/release-offline-content.ts`) decides both
release paths, and it is what makes released space *stay* released:

- **Unstarring releases the copy**, unless the article's feed is set to
  prefetch. Star is what causes a copy to exist, so unstar is what ends
  it; a feed set to prefetch is a second, independent reason to keep it,
  and clearing against that would only mean re-downloading on the next
  refresh.
- **"Free up space"** in Settings sweeps every copy nothing is
  maintaining, confirms first, and schedules a push so the cloud vault
  shrinks too.

Clearing a *starred* article's copy was rejected: the prefetch service
would download it again on the next refresh. Space that comes back is
not space, it is churn.

Nothing the user authored is touched. The article, its read state, its
stars and its folder overrides survive, and full text can be re-fetched
on demand while online.

### Size is sampled anonymously, in buckets, on the server

Each PUT logs one line through `logEvent`
(`packages/core/src/utils/log-event.ts`): route, method, a
power-of-two size bucket, and the transport the client used. It writes
to `console.log` rather than `console.error`, because a routine sample
is not an ops event and mixing the two inflates the log on-call reads.

The allow-list discipline is `logError`'s: the TypeScript interface is
the allow-list, plus a defensive runtime pick so a caller reaching for
`any` still cannot leak a vaultId, an IP or any ciphertext.

**Buckets, not sizes, and no identity.** The question worth answering is
"are vaults drifting toward the ceiling across the population", which
needs a distribution. "How big is this particular person's vault" is
behavioural telemetry the product promises not to collect, and an exact
byte count per push, even without a vaultId, is a series that would
start to single vaults out. Anything past the top bucket collapses into
one label for the same reason.

## Consequences

- The sync size error and the headroom warning can finally name
  unstarring, because unstarring now does something. Their tests assert
  the copy names a working lever, so if either release path regresses
  the message goes back to being a lie and a test says so.
- A user with a vault full of *starred* offline copies still has work to
  do: the sweep will not touch those, by design. The warning says so.
- Unstarring is now mildly destructive. It removes a copy that may be
  the last one if the publisher has since pulled the page. This is the
  cost of making the star mean what it says, and the confirmation
  dialog on the bulk action spells out the same trade-off. If it proves
  wrong, the fix is a grace period on release, not a return to keeping
  everything forever.
- The operator gains a size distribution in the logs and still cannot
  answer questions about an individual. That is the intended ceiling on
  what this observability can ever do; a percentile on
  `/api/stats-sync` was considered and not built, because every adapter
  would have to enumerate sizes per request (Upstash would need a
  `STRLEN` per key) or keep a running counter that only ever rises,
  which answers the wrong question.

## Alternatives considered

- **Shed `extractedContent` automatically when a push is too large.**
  Rejected in ADR 031 and still rejected: `importAll` replaces articles
  wholesale, so a shrunken push would silently delete another device's
  offline copies, and that content is sometimes the only surviving copy
  of a page.
- **Release on a timer (e.g. copies older than N days).** A second,
  invisible rule competing with the star. The star is already the
  user's statement about what to keep; an age policy would quietly
  overrule it.
- **Per-user size metering server-side.** The straightforward way to
  answer "who is about to be blocked", and precisely the telemetry the
  privacy principles forbid. The device-local headroom readout answers
  it for the only person who can act on it.
