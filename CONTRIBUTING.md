# Contributing to FeedZero

[`CLAUDE.md`](./CLAUDE.md) is the source of truth for how this codebase is developed. This document is a quick-start that links into it — when in doubt, the longer doc wins.

## Development Workflow

This project follows **Red-Green-Refactor (RGR)** for all code changes:

1. **RED** — Write a failing test first
2. **GREEN** — Write minimal code to make it pass
3. **REFACTOR** — Clean up the code (this step is mandatory)

No production code without a failing test. No commit without refactoring. The full sequence (PLAN → RED → GREEN → VERIFY → REFACTOR → DOCUMENT) is in [CLAUDE.md → Development Workflow](./CLAUDE.md#development-workflow).

## Getting Started

```bash
git clone https://github.com/forcingfx/feedzero.git
cd feedzero
npm ci
npm run dev     # Dev server at http://localhost:3000
npm test        # Run tests
```

## Running Tests

```bash
npm test              # All unit/integration tests (~9s)
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report — thresholds enforced in CI
npm run test:e2e      # Playwright E2E tests
npx tsc --noEmit      # Type check (strict)
```

## Code Style

- TypeScript strict mode (no `any` except in type declarations for untyped libraries)
- No ESLint/Prettier — TypeScript compiler is the primary static analysis tool
- Self-documenting code: if you need a comment to explain *what*, rename or extract instead
- Comments only for *why* (intent, trade-offs, non-obvious decisions)

For the full code-review checklist (clean code rules, naming, function size, structure, code smells), see the **Clean Code rules** section of [`CLAUDE.md`](./CLAUDE.md). It is the source of truth for engineering style on this project.

## Architecture Guidelines

### Core Modules Are Framework-Agnostic

Code in `src/core/` and `src/utils/` must have zero React imports. These modules are the shared backend that could be reused in other contexts (CLI, mobile app, etc.).

### Result Types Over Exceptions

All core functions return `Result<T>` types instead of throwing:

```typescript
const result = await addFeed(url);
if (!result.ok) {
  // Handle error via result.error
  return;
}
// Use result.value
```

### State Lives in Zustand Stores

UI components subscribe to store slices. Stores call core modules directly. URL is the source of truth for navigation.

### Security First

- Sanitize all external content through DOMPurify
- Use Web Crypto API for encryption (never hand-roll crypto)
- Validate and block private IPs in proxy endpoints
- Never trust user or feed input

## Pull Request Process

1. **Branch from `main`**: `git checkout -b feat/your-feature`

2. **Follow RGR**: Tests first, then implementation, then refactor

3. **Verify before pushing**:
   ```bash
   npm test
   npx tsc --noEmit
   npm run test:e2e  # If touching UI
   ```

4. **Write descriptive commits**: Conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`); bug fixes need What / Why / Fix / Prevention. Full rules in [CLAUDE.md → Commit Messages](./CLAUDE.md#commit-messages).

5. **Open the PR**: The [pull request template](.github/pull_request_template.md) walks through the RGR + smoke-test checklist and the three-entry-point checklist for API changes. Tick the boxes that apply, delete the sections that don't.

6. **Keep PRs focused**: One feature or fix per PR. Split large changes.

7. **Update documentation**: If you changed behavior, update `docs/` to match.

## What We're Looking For

- Bug fixes with regression tests
- Performance improvements with benchmarks
- Accessibility improvements
- Feed format compatibility (RSS variants, Atom edge cases)
- Privacy enhancements that don't compromise usability

## What We're Not Looking For

- Features that require server-side state (beyond encrypted blob storage)
- Analytics, telemetry, or tracking of any kind
- Dependencies that make network calls without user action
- UI redesigns without prior discussion

## Reporting security issues

Do not open a public issue for security vulnerabilities. See [SECURITY.md](./SECURITY.md) for the disclosure policy — preferred channel is a private [GitHub Security Advisory](https://github.com/forcingfx/feedzero/security/advisories/new); email `security@feedzero.app` is also accepted.

## Questions?

Open a GitHub issue for discussion before starting significant work. This saves everyone time.
