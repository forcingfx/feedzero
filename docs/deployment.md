# Deployment Guide

## Prerequisites

- Node.js 20.x or later
- npm or compatible package manager
- Vercel account (for production deployment)

## Vercel Deployment

FeedZero is configured for deployment on Vercel with serverless functions.

### Initial Setup

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Link your project:
   ```bash
   vercel link
   ```

3. Deploy:
   ```bash
   vercel deploy --prod
   ```

### Configuration Files

**`vercel.json`** — Deployment configuration:
- `buildCommand`: Runs Vite production build
- `outputDirectory`: Static assets output to `dist/`
- `functions`: Configures Node.js 20.x runtime for `api/**/*.ts`
- `rewrites`: Routes `/api/*` to serverless functions, all other routes to SPA

**`tsconfig.api.json`** — TypeScript config for serverless functions:
- Extends main `tsconfig.json`
- Includes `api/` directory
- Used by Vercel's build process to transpile API functions

### Serverless Functions

**`api/feed.ts`** — RSS/Atom/JSON Feed proxy
- Endpoint: `/api/feed?url=<encoded-feed-url>`
- Default content-type: `text/xml`
- Used by: Feed addition, refresh, discovery

**`api/page.ts`** — Web page proxy for extraction
- Endpoint: `/api/page?url=<encoded-page-url>`
- Default content-type: `text/html`
- Used by: Full-text article extraction

Both functions:
- Import from `src/core/proxy/proxy-handler.ts` (shared logic)
- Validate URLs with SSRF protection
- Return 400/403/502 status codes on errors
- Require `.ts` extensions in import paths for Node.js ESM compatibility

### Import Path Requirements

Node.js ESM requires explicit file extensions in imports. The serverless functions use:

```typescript
// ✓ Correct
import { handleProxyRequest } from "../src/core/proxy/proxy-handler.ts";

// ✗ Wrong (works in Vite/bundlers but fails in Node.js)
import { handleProxyRequest } from "../src/core/proxy/proxy-handler";
```

Additionally, path aliases (`@/`) don't resolve in Node.js runtime. Use relative paths:

```typescript
// ✓ Correct
import { ok, err } from "../../utils/result.ts";

// ✗ Wrong (fails in Vercel serverless runtime)
import { ok, err } from "@/utils/result.ts";
```

### Environment Variables

FeedZero is a client-side application with no environment-specific configuration. All data is stored locally in the browser (IndexedDB).

### Testing Deployment Locally

Test the production setup locally with Vercel CLI:

```bash
# Start local Vercel dev server
vercel dev

# The app will be available at http://localhost:3000
# Serverless functions run locally with same behavior as production
```

Verify:
- Frontend loads correctly
- Adding a feed works (tests `/api/feed` endpoint)
- Article extraction works (tests `/api/page` endpoint)
- No 500 errors in function logs

### Monitoring

Check Vercel function logs for runtime errors:

```bash
vercel logs
```

Or via Vercel dashboard → Project → Functions tab.

Common issues:
- **500 errors**: Import path issues (missing `.ts` extensions or path aliases)
- **403 errors**: SSRF protection blocking legitimate URLs (verify URL is public)
- **502 errors**: Upstream fetch failed (network issues, invalid URL, timeout)

## Alternative Platforms

The app can be deployed to any static hosting platform with serverless function support:

### Netlify

Create `netlify/functions/` directory and adapt the handlers:

```typescript
// netlify/functions/feed.ts
import { handleProxyRequest } from "../../src/core/proxy/proxy-handler.ts";

exports.handler = async (event) => {
  const req = new Request(`http://localhost${event.path}?${event.rawQuery}`);
  const response = await handleProxyRequest(req, "text/xml");
  return {
    statusCode: response.status,
    body: await response.text(),
    headers: Object.fromEntries(response.headers),
  };
};
```

### Cloudflare Pages

Create `functions/api/` directory with similar adaptations for Cloudflare Workers API.

### Self-Hosted

For self-hosted deployments:

1. Build the frontend:
   ```bash
   npm run build
   ```

2. Serve `dist/` with any static file server (nginx, Apache, etc.)

3. Implement `/api/feed` and `/api/page` endpoints using your backend framework (Express, Fastify, etc.):
   ```javascript
   // Express example
   app.get('/api/feed', async (req, res) => {
     const request = new Request(`http://localhost${req.url}`);
     const response = await handleProxyRequest(request, 'text/xml');
     res.status(response.status);
     res.set(Object.fromEntries(response.headers));
     res.send(await response.text());
   });
   ```

## Build Verification

Before deploying, verify the build locally:

```bash
# Run full test suite
npm test

# Type check frontend
npx tsc --noEmit

# Type check API functions
npx tsc --project tsconfig.api.json --noEmit

# Build for production
npm run build

# Preview production build
npx vite preview
```

All checks must pass before deployment.

## SSRF Security

The proxy endpoints include comprehensive SSRF protection. Do not disable or weaken these checks in production:

- Blocks all localhost/loopback addresses
- Blocks private IP ranges (RFC 1918)
- Blocks cloud metadata endpoints
- Only allows HTTP/HTTPS protocols

See `src/core/proxy/validate-url.ts` for implementation details.
