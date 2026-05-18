---
slug: pocket
title: "Moving from Pocket? Here's where to land."
description: "Pocket shut down on November 12, 2025. FeedZero is a privacy-first RSS reader that can absorb your old reading habit without selling you out to the next acquirer."
intended_url: https://feedzero.app/pocket
---

# Moving from Pocket? Here's where to land.

Pocket shut down on **November 12, 2025**. Mozilla pulled the apps, disabled the API, and queued every saved article for deletion. If you exported your data before the deadline, you have an HTML file full of links — and nowhere good to put them.

FeedZero might be that nowhere good. Here's the honest pitch.

## What FeedZero is

FeedZero is an RSS reader, not a read-it-later app. The mental model is different:

- **Pocket** saved individual articles. You opened it to clear a queue.
- **FeedZero** subscribes to the *sources* that publish those articles. You open it to catch up on what's new, then close it.

For most Pocket users that turns out to be the better model. The reason you saved 200 NYT articles wasn't because you loved 200 articles — it was because you wanted to know what NYT published. Subscribing to the source, once, replaces saving the article 200 times.

## What we'll do with your Pocket export

Drop your `pocket-export.html` into the Import dialog. FeedZero:

1. Parses every saved link in the file.
2. Groups them by site (so 30 NYT articles become "you read NYT").
3. Tries to discover an RSS feed for each site automatically.
4. Subscribes you to the feeds it found.

You'll usually end up with somewhere between 5 and 50 feed subscriptions, depending on how varied your Pocket library was. You can prune from there.

The original article URLs are not imported — RSS readers don't have a queue. If you want a queue, FeedZero is not for you, and we'd rather you know that now.

## Why this won't happen to you again

The list of read-later / RSS shutdowns in the last 19 months: **Pocket (2025-11), Tiny Tiny RSS original (2025-11), Omnivore (2024-11), Artifact (2024-01).** Four products that took user data with them when they left.

The structural reasons FeedZero is built differently:

- **Nothing to sell, sublicense, or accidentally leak.** Our server holds opaque encrypted blobs. Your reading list, your saves, your read state — we genuinely cannot see them. ([Vault format documented.](../vault-format.md))
- **Lossless exit.** OPML import/export round-trips. The vault format is publicly specified. The server runs as a single Hono binary you can self-host. If we shut down, your data leaves with you.
- **No VC runway.** No board demanding hockey-stick growth. We grow at the pace the work supports — see our [sustainability commitment](../../README.md#sustainability-commitment).
- **Open source.** Audit the claims. Fork the code. Send patches.

## What you trade away

We don't have:

- A read-later queue (RSS, not Pocket).
- Server-side AI summarization. Every product in the category that does this sends your reading content to a third-party LLM. We won't.
- A native iOS or Android app. The web app installs as a PWA (Add to Home Screen).
- A social graph or "popular among your contacts" feature. Incompatible with end-to-end encryption.

If those gaps are dealbreakers, fair. We'd rather lose you to NetNewsWire (free, native, Apple-only) or Readwise Reader (great PKM workflow, cloud AI) than over-promise.

## Get started

1. Visit [feedzero.app](https://feedzero.app).
2. Choose "Sync across devices" if you want your subscriptions to follow you. Save your four-word passphrase — it's the only way back in.
3. Settings → Import → drop your `pocket-export.html`.
4. Wait 30–60 seconds while FeedZero discovers feeds. Prune what you don't want. Close the tab. Come back tomorrow.

You're welcome here.
