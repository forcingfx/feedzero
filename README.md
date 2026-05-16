# FeedZero

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

FeedZero can run entirely on your own infrastructure:

```bash
VITE_SELF_HOSTED=1 npm run build:all
npm run serve
```

This starts a standalone Hono server with all API endpoints. Point your reverse proxy at it.

### `VITE_SELF_HOSTED=1`

The hosted build at my.feedzero.app gates some features behind the Personal tier (currently auto-organize; later: filters, mute keywords). Setting `VITE_SELF_HOSTED=1` at build time bypasses every tier gate — every shipped feature is available to self-hosters at no charge. Features marked "coming soon" stay unavailable until the code lands; the flag doesn't conjure them into existence.

Persist the flag in a `.env.production` file at the repo root if you build via CI:

```
# .env.production
VITE_SELF_HOSTED=1
```

See [docs/decisions/012-open-core-feature-gating.md](docs/decisions/012-open-core-feature-gating.md) for the design and the honor-system tradeoff.

For Vercel deployment, `git push` to a connected repository. The `api/` directory contains serverless function wrappers.

## Tech Stack

- **UI**: React 19, TypeScript, Tailwind CSS v4
- **State**: Zustand
- **Storage**: Dexie.js (IndexedDB), Web Crypto API
- **Parsing**: Custom RSS/Atom/JSON Feed parser
- **Sanitization**: DOMPurify
- **Extraction**: Defuddle
- **Testing**: Vitest, Playwright, React Testing Library

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md) for reporting guidelines.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow and guidelines.

## License

MIT
