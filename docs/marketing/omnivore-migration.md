---
slug: omnivore
title: "Moving from Omnivore? Here's where to land."
description: "Omnivore shut down on November 15, 2024 after the team was acquihired by ElevenLabs. FeedZero is a privacy-first RSS reader for the audience Omnivore served — built to outlive the next acquisition."
intended_url: https://feedzero.app/omnivore
---

# Moving from Omnivore? Here's where to land.

Omnivore shut down on **November 15, 2024**. The team joined ElevenLabs, the service went dark, user data was deleted. The open-source code is still on GitHub — unmaintained — and a small community fork lives at `omnivore.work` for anyone willing to self-host.

You probably picked Omnivore because the alternatives (Pocket, Instapaper) felt like surveillance products. Then Pocket shut down too. We notice this.

## What FeedZero is, and isn't

FeedZero is an **RSS reader**, not a read-it-later app. That's a real difference:

- **Omnivore** saved articles. You opened it to clear a queue.
- **FeedZero** subscribes to the *sources* that publish those articles. You open it to see what's new.

Where Omnivore's draw was privacy + highlighting + AI summarization, FeedZero's draw is privacy + the trunk: fetching feeds reliably and presenting them in a reader that's a pleasure to use. We don't ship AI summarization yet — every implementation in the category sends your reading content to a centralized LLM, and we're not willing to do that.

## Importing Omnivore data

If you exported your Omnivore library before the shutdown, you have a JSON or HTML file of saved articles. Drop it into Settings → Import. FeedZero extracts the source domains and tries to discover an RSS feed for each one, leaving you with subscriptions to the publishers you cared about. (The article queue itself doesn't import — RSS readers don't have queues.)

If you didn't export in time, you can still rebuild from memory. Most Omnivore users had 5–30 publishers in active rotation; the long tail rarely makes the move.

## Why we expect to be here in 2030

The structural commitments that keep FeedZero around:

- **The server holds opaque encrypted blobs.** We can't sell your data, can't sublicense it, can't accidentally leak it. ([Format documented.](../vault-format.md))
- **Lossless exit.** OPML round-trips. Vault format public. Self-hostable as a single binary.
- **Open source.** Audit the claims. Fork it if we ever go quiet.
- **No VC runway.** No board demanding hockey-stick growth. See our [sustainability commitment](../../README.md#sustainability-commitment).
- **Acquihires don't work the same way.** Our value isn't a team — it's the architecture and the audience trust. There's no equivalent of "ElevenLabs acquires the FeedZero team and shuts down the service" because the service is the architecture, not the team.

## Where we differ from Omnivore

We don't have:

- Article highlighting with per-paragraph notes. The PKM workflow Readwise Reader is great for — go there if that's your pattern.
- Cloud AI summarization or Q&A over saved articles. Every cloud implementation we've seen leaks reading content; we won't.
- A native mobile app (PWA only).
- A queue. Subscribe to sources, not articles.

## Get started

1. Visit [feedzero.app](https://feedzero.app).
2. Pick a passphrase. Choose sync if you want subscriptions across devices.
3. Settings → Import → drop your Omnivore export.
4. Prune the discovered feed list. Close the tab.

We'll still be here when the next product shuts down.
