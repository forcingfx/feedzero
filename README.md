# FeedZero

www.feedzero.app

A privacy-first RSS reader that runs entirely in your browser. No accounts, no tracking, no analytics. Your reading habits stay yours.

## What It Does

- Subscribes to RSS, Atom, and JSON Feed sources
- Stores all data encrypted in your browser (AES-GCM-256)
- Optionally syncs across devices with end-to-end encryption
- Extracts full article text when feeds provide only summaries
- Works offline after first load

## Privacy Model

FeedZero minimizes server-side data exposure:

| Component | What the server sees |
|-----------|---------------------|
| **Feed fetching** | Feed URLs (required for CORS proxy) |
| **Cloud sync** | Encrypted blob + vault ID (cannot decrypt without your passphrase) |
| **Everything else** | Nothing — parsing, storage, and rendering happen in-browser |

**No telemetry. No analytics. No crash reporting. No third-party tracking.**

For the full threat model, cryptographic details, and honest limitations, see [docs/architecture.md](docs/architecture.md#privacy--threat-model).

### Trust Considerations

The CORS proxy is a trust point. It must see feed URLs to fetch them. If you don't trust the hosted version, you can [self-host](#self-hosting) the entire stack.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000. Add a feed URL. That's it.

## Usage

### Adding Feeds

Paste any URL into the "Add feed" input:
- Direct feed URL: `https://example.com/feed.xml`
- Website URL: FeedZero will discover the feed automatically

### Keyboard Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Next / previous item |
| `Enter` | Open selected item |
| `Escape` | Go back |

### Cloud Sync (Optional)

1. Open Settings → Data & Storage
2. Enable cloud sync
3. Save your 4-word passphrase — it's the only way to access your data

Your passphrase never leaves your browser. The server stores only encrypted blobs.

### OPML Import/Export

- **Import**: Settings → Import OPML → select file
- **Export**: Settings → Export OPML → downloads your feed list

## Development

```bash
npm test              # Unit/integration tests (Vitest)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report (90% threshold)
npm run test:e2e      # E2E tests (Playwright)
npx tsc --noEmit      # Type check
```

### Project Structure

```
src/
├── core/           # Framework-agnostic business logic
│   ├── feeds/      # Feed fetching, parsing, refresh
│   ├── parser/     # RSS/Atom/JSON Feed parsing
│   ├── storage/    # IndexedDB + encryption
│   ├── sync/       # E2E encrypted cloud sync
│   └── extractor/  # Full-text extraction
├── stores/         # Zustand state management
├── components/     # React UI components
└── pages/          # Route components
```

See [docs/architecture.md](docs/architecture.md) for detailed architecture documentation.

## Self-Hosting

Run the whole stack yourself with Docker. Three steps:

```bash
git clone https://github.com/forcingfx/feedzero.git && cd feedzero
cp .env.example .env        # set HOSTNAME — a domain, or a LAN IP
./scripts/feedzero up       # Windows: pwsh .\scripts\feedzero.ps1 up
```

Open `https://<HOSTNAME>` and save the passphrase it shows. A public
hostname gets automatic HTTPS; a LAN IP gets a self-signed cert. Full
walkthrough, day-2 ops (`update`/`backup`/`restore`), and troubleshooting:
**[docs/self-hosting.md](docs/self-hosting.md)**.

Self-hosting unlocks every Personal feature for free (`VITE_SELF_HOSTED=1`,
baked into the image). Deploying on Vercel instead? `git push` a connected
repo — `scripts/build-api.js` bundles the `api/` functions.

## Tech Stack

- **UI**: React 19, TypeScript, Tailwind CSS v4
- **State**: Zustand
- **Storage**: Dexie.js (IndexedDB), Web Crypto API
- **Parsing**: Custom RSS/Atom/JSON Feed parser
- **Sanitization**: DOMPurify
- **Extraction**: Defuddle
- **Testing**: Vitest, Playwright, React Testing Library

## Sustainability commitment

FeedZero is built as a sustainable business, not a venture-funded runway. The category around us has gotten brutal — Pocket shut down November 2025, Omnivore November 2024, Tiny Tiny RSS's original maintainer retired the project the same month, Artifact closed January 2024. Each of those services took user data with them.

The structural commitments that keep FeedZero around:

- **No external runway to outrun.** No VC, no board demanding hockey-stick growth. We grow at the pace the work supports.
- **No data we cannot lose.** The server holds opaque encrypted blobs. There is nothing here to sell, sublicense, or accidentally leak — see [docs/vault-format.md](docs/vault-format.md) for the format.
- **Lossless exit at all times.** OPML import/export round-trips, the [vault format](docs/vault-format.md) is publicly documented, and the entire server runs as a single Hono binary you can self-host. If FeedZero ever shuts down, your data leaves with you.
- **Open source.** The privacy claims and the code that delivers them are auditable today.
- **Focused.** We are great at one thing: fetching feeds reliably and presenting them in a reader that's a pleasure to use. We decline features that would distract from that, even when the market is asking for them — see [docs/strategy/003-playing-to-win.md](docs/strategy/003-playing-to-win.md).

If you're migrating from a product that just shut down, you're welcome here. We'll still be here when the next one does.

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for reporting guidelines.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE) for the full text.

If you run a modified version of FeedZero as a public-facing service,
section 13 of the AGPL requires you to offer your users access to the
source of that modified version. The default deployment satisfies this
out of the box because the source is already public — for any fork, host
the diff somewhere your users can reach.
