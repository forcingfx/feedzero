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

Self-hosting is a first-class deployment. One master switch, one preflight,
and a reverse proxy with TLS is everything you need.

```bash
git clone https://github.com/forcingfx/feedzero.git
cd feedzero
echo "VITE_SELF_HOSTED=1" > .env.production
echo "SELF_HOSTED=1"      >> .env.production   # runtime mirror of the build flag
npm install
npm run build:all
npm run serve                                  # binds 0.0.0.0:3000
```

Then put Caddy or nginx in front of `:3000` with a TLS cert pointing at a
hostname you control. **HTTPS is non-negotiable** — browsers gate the Web
Crypto API (which encrypts your data at rest) behind a secure context, so
plain `http://<lan-ip>:3000` will refuse to start. The app detects this and
shows you the fix.

**See the full guide:** [feedzero.app/docs/self-hosting](https://feedzero.app/docs/self-hosting)

### What `VITE_SELF_HOSTED=1` does

It's the **single master switch** for self-hosting:

- Bypasses every tier gate — every shipped Personal feature is available at no charge.
- Hides Subscribe / pricing UI.
- Disables the paid-tier API enforcement (`LAUNCH_PAID_TIER` is forced off).
- Switches the upstream User-Agent to a browser-like string (fewer WAF blocks).

Features marked "coming soon" stay unavailable until the code lands — the
flag doesn't conjure them into existence.

`VITE_SELF_HOSTED=1` is a build-time flag (rebuild after changing).
`SELF_HOSTED=1` is its runtime mirror used by the server. Set both for the
single-switch invariant to hold end-to-end.

### What you give up vs. the hosted deployment

Self-hosting is supported but not magical. Things you lose:

- **Upstream rate-limiting**: the hosted deployment uses Upstash to smooth
  bursts; without it, a bulk refresh on a fresh IP can trigger upstream 429s.
  Symptoms appear as feeds that work on `my.feedzero.app` but fail locally.
- **IP reputation**: the hosted deployment shares infrastructure IPs known to
  upstreams. Fresh datacenter/residential IPs may be blocked by Cloudflare-class
  WAFs. The new browser-like User-Agent default mitigates but doesn't eliminate this.
- **Automatic TLS**: your reverse proxy must provide it. Caddy is the path of
  least resistance.
- **Managed sync storage backups**: the filesystem adapter writes to
  `data/`; back it up yourself.

See [docs/decisions/014-self-host-first-class.md](docs/decisions/014-self-host-first-class.md) for the design rationale and the messaging lesson from feedback #88.

### Vercel deployment

For Vercel deployment, `git push` to a connected repository. The `api/`
directory contains serverless function wrappers; `scripts/build-api.js`
bundles them.

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
