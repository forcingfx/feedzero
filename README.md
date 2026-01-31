# FeedZero

Privacy-first RSS reader built with vanilla JavaScript and targeted open-source libraries. No tracking, no analytics.

## Features

- RSS 2.0 and Atom 1.0 feed parsing
- All data encrypted at rest (AES-GCM-256 via Web Crypto API)
- Production-grade HTML sanitization (DOMPurify)
- Offline support via Service Worker
- Keyboard navigation (j/k/Enter/Escape)
- Accessible (WCAG 2.1 AA: semantic HTML, ARIA, keyboard navigable)

## Quick Start

```bash
npm install
npm run dev        # Starts dev server on http://localhost:3000
```

Open http://localhost:3000 and add a feed URL.

## Development

```bash
npm test             # Run all tests
npm run test:watch   # Run tests in watch mode
npm run test:coverage # Run tests with coverage report
npm run test:e2e     # Run Playwright E2E tests
```

## Architecture

See [docs/architecture.md](docs/architecture.md) for system overview, data flow, and module dependency graph.

Key design decisions are documented as ADRs in [docs/decisions/](docs/decisions/).

## Tech Stack

- **Language**: Vanilla JavaScript (ES modules)
- **UI**: Web Components
- **Storage**: Dexie.js (IndexedDB) + Web Crypto API
- **Sanitization**: DOMPurify
- **Offline**: Service Workers
- **Tests**: Vitest + Playwright
