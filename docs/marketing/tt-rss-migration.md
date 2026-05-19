---
slug: tt-rss
title: "Tiny Tiny RSS's maintainer walked away. Yours doesn't have to."
description: "Andrew Dolgov retired the original Tiny Tiny RSS project on 2025-11-01. The community fork lives — but if you'd rather not babysit a server, FeedZero is a privacy-first RSS reader with optional E2E sync."
intended_url: https://feedzero.app/tt-rss
---

# Tiny Tiny RSS's maintainer walked away. Yours doesn't have to.

On **2025-11-01**, Andrew Dolgov (Fox) retired Tiny Tiny RSS, dismantling the public infrastructure and the official repo. Long-time contributor `supahgreg` forked the codebase the same week to [github.com/tt-rss/tt-rss](https://github.com/tt-rss/tt-rss) and the project lives on under community maintenance. The tt-rss.org domain redirects there now.

If you're happy maintaining your tt-rss instance against the community fork, fantastic — that's exactly the model we want to see survive. This page is for the contingent who, after years of running a TT-RSS server, are reconsidering whether they really want to keep running a TT-RSS server.

## What FeedZero offers that TT-RSS doesn't

- **No server to maintain.** FeedZero is browser-first. The hosted version at [feedzero.app](https://feedzero.app) gives you the reader and a CORS proxy; everything else runs in your browser.
- **End-to-end encrypted sync** across devices, by default. No PHP, no MySQL, no nightly cron, no upgrade-day. ([Format documented.](../vault-format.md))
- **A reader pane that's actually a pleasure to use.** TT-RSS optimizes for the power-user backend; FeedZero optimizes for reading.

## What you keep from TT-RSS

- **The trust model.** TT-RSS's appeal was "my data lives on my server, not someone else's." FeedZero's E2E architecture preserves that: the operator (us) cannot read your feed list, your reads, your saved articles. Period. We can't subpoena what we don't have.
- **Self-hostable.** If the hosted service goes away, FeedZero's [Hono server](../../README.md#self-hosting) runs as a single binary on whatever you used to run TT-RSS on. Same threat model, less maintenance.
- **Open source.** Audit, fork, contribute.

## Importing your TT-RSS subscriptions

TT-RSS exports OPML cleanly. Settings → Preferences → Feeds → OPML → Export. Drop the resulting `tt-rss-feeds.xml` into FeedZero's Settings → Import. Sub-second import for hundreds of feeds, no API token shuffle.

Read state doesn't import — TT-RSS's API doesn't expose it in OPML and we don't have the article corpus locally yet. You'll start with everything unread; mark-all-as-read on day one is a clean way to begin.

## What we differ on

- **Power-user filtering.** TT-RSS has rules. FeedZero doesn't yet. (We're building toward it; not there.)
- **Plugin ecosystem.** TT-RSS's strength. FeedZero is opinionated — fewer hooks, less to break.
- **AI summarization.** Neither of us ships it well today. Every cloud AI integration in the category leaks reading content; we won't until we have an architecture that doesn't.

## Why we built this

FeedZero exists to protect its users — journalists, activists, people whose reading habits matter. The privacy moat is also a sustainability moat: nothing to sell, no platform liability, [no VC runway to outrun](../../README.md#sustainability-commitment). We expect to be here in 2030. Most readers in this category won't.

## Get started

1. Visit [feedzero.app](https://feedzero.app).
2. Pick a passphrase. Enable sync.
3. Settings → Import → upload your TT-RSS OPML export.
4. Done.

You're welcome here.
