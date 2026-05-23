# iOS rollout — execution runbook

The work plan for shipping FeedZero on the App Store. The **why** lives in
[ADR 023](../decisions/023-native-ios-via-react-native.md); the
**strategic context** lives in [`003-playing-to-win.md`](../strategy/003-playing-to-win.md).
This doc is the ordered queue of remaining work — what to land next, in
what order, and how to know when each step is done.

## Status (2026-05-23)

Shipped on `claude/feed-zero-ios-release-5gcuH`:

- ADR 023 + strategy refresh (Phase 0).
- npm workspaces scaffolding: `packages/{core,web,mobile}` with placeholder `package.json` + README (Phase 1, slice 1/4).
- `src/types/index.ts` + `src/utils/*.ts` moved to `packages/core/src/` and 242 import sites rewritten (Phase 1, slice 2/4).
- `StorageBackend` interface defined at `packages/core/src/storage/storage-backend.ts` (Phase 2, slice 1/3).

Remaining: most of Phase 1 (remaining file moves), most of Phase 2 (other two adapters + implementations), and all of Phases 3–6.

## Prerequisites — actions only the user can do

Land these in parallel with the code work below; they have multi-day lead
times and are not blockable by this repo.

1. **Apple Developer Program enrollment** — $99/year. Pick the legal entity (individual vs business) carefully; you can't change it later without re-enrolling.
2. **App Store Connect app record** — bundle ID `app.feedzero.ios`. Reserve the listing name; iOS app names must be unique per region.
3. **RevenueCat account** — free until ~$2.5k MTR. Configure the iOS app, link the App Store Connect API key, set up `Personal+` and `Pro` entitlements that mirror `src/core/features/tier-matrix.ts`.
4. **App Store Connect API key** — needed by EAS Build to ship to TestFlight without manual upload.
5. **Universal Links AASA** — once the Apple Team ID is known, the file at `https://my.feedzero.app/.well-known/apple-app-site-association` must serve `{"applinks":{"apps":[],"details":[{"appID":"TEAMID.app.feedzero.ios","paths":["/feeds/*"]}]}}` with `Content-Type: application/json`. This is a `feedzero-landing` PR, not this repo.

## Ordered code commits — Phase 1 + Phase 2 completion

Each entry is one self-contained commit. The next slice of work is roughly six commits to take us through the end of Phase 2.

### A. `feat(core)`: define `CryptoBackend` and `KeyValueStore` interfaces (~1 hour)

Mirror the [`StorageBackend`](../../packages/core/src/storage/storage-backend.ts) shape. Two new files:

- `packages/core/src/storage/crypto-backend.ts` — wraps the subset of Web Crypto the app actually uses (`subtle.encrypt`, `subtle.decrypt`, `subtle.deriveKey`, `subtle.importKey`, `subtle.exportKey`, `subtle.sign` for HMAC, `getRandomValues`). The current `src/core/storage/crypto.ts` is the de facto reference impl.
- `packages/core/src/storage/key-value-store.ts` — `get(key)` / `set(key, value)` / `remove(key)` / `clear()`. The web impl is `localStorage`; the mobile impl is `react-native-mmkv`.

Pin invariants in JSDoc (no-export of raw keys, AES-GCM-256 only, etc.). Type-only files; zero runtime impact.

**Done when:** both files committed, `npx tsc --noEmit` clean.

### B. `refactor(core)`: extract `src/core/storage/crypto.ts` → `packages/core/src/storage/web-crypto-backend.ts` (~1 day)

Wrap the existing function bodies in a class implementing `CryptoBackend`. The class uses `globalThis.crypto.subtle` directly (web only). All call sites in `src/core/storage/`, `src/core/sync/`, `src/core/license/` that import `./crypto.ts` move to import the class instance from the new location.

The relative-path-in-`src/core/` rule from the types/utils extraction still applies — `src/core/sync/sync-handler.ts` etc. must import via `../../../packages/core/src/storage/web-crypto-backend` (because the Vite dev proxy loads them via Node).

Add a one-test contract fixture at `tests/core/storage/crypto-backend-contract.test.ts`: instantiate the class, assign to a `CryptoBackend` variable, run the existing crypto round-trip assertion against it.

**Done when:** `npx tsc --noEmit` clean, `npm test` passes (3251+ green), `npm run build` clean.

### C. `refactor(core)`: route all `localStorage` call sites through `KeyValueStore` (~1–2 days)

Audit list (from CLAUDE.md): `stores/license-store.ts`, `stores/signal-store.ts`, `core/storage/key-material.ts`, `utils/constants.ts` `LOCAL_STORAGE` consumers. Plus a grep sweep — `grep -rln 'localStorage\.' src` is the source of truth.

Create `packages/core/src/storage/web-key-value-store.ts` (the `localStorage`-backed impl) and a small `getKeyValueStore()` accessor that returns the registered impl. Web app calls `registerKeyValueStore(new WebKeyValueStore())` once at startup (in `src/main.tsx` or `src/app.tsx`).

**Done when:** zero direct `localStorage.{get,set,remove}Item` calls remain in `src/`, `packages/core/` (other than inside `web-key-value-store.ts`); tests green; build clean.

### D. `refactor(core)`: extract `src/core/storage/db.ts` → `packages/core/src/storage/web-storage-backend.ts` (~2–3 days)

The biggest commit of Phase 2. Wrap `db.ts`'s 35 exported functions in a class implementing `StorageBackend`. Module-level mutable state (`db`, `cryptoKey`, `hmacKey`) becomes private instance state. The `requireOpen` helper becomes a private method.

Stores currently import individual functions (`import { getFeeds } from "@/core/storage/db.ts"`); they switch to `getStorageBackend().getFeeds()` via the same accessor pattern as `KeyValueStore`. ~50 call sites.

Add a conformance test at `tests/core/storage/storage-backend-contract.test.ts` — `const backend: StorageBackend = new WebStorageBackend()` is the smoke; the actual round-trip tests already exist in `tests/core/storage/db.test.js` and can be ported with minimal changes.

**Done when:** the relative-path imports `../../../packages/core/src/utils/*` in `src/core/storage/` can be deleted (storage code is now under `packages/core/`); tests green; build clean.

### E. `chore(workspaces)`: move `src/stores/` and `src/utils/` consumers' interface boundaries (~1 day)

At this point most of `src/core/` has moved or routes through adapters. The remaining `src/components/`, `src/hooks/`, `src/lib/`, `src/pages/` files still live in the root `src/` and are bundled by Vite as the web app. That's fine — they're the web-app surface and don't move to `packages/core`. They stay where they are.

What this commit does: confirm the boundary. Add a one-line `tsconfig` lint or a small `tests/core/no-ui-imports.test.ts` that fails if anything under `packages/core/` imports from `src/components/` or `src/pages/`. This locks the CLAUDE.md "core modules must not import from UI" invariant for the new layout.

**Done when:** the boundary test exists and passes.

### F. `feat(mobile)`: scaffold the Expo app with a "hello vault" screen (~1 day)

First proof-of-life on the mobile path. `cd packages/mobile && npx create-expo-app . --template blank-typescript`. Add `@feedzero/core` as a dependency. Write a single screen that:

- Imports `getStorageBackend` and `getCryptoBackend` from `@feedzero/core`.
- Registers stub impls (in-memory; the real SQLite + react-native-quick-crypto impls come next).
- Calls `getStorageBackend().open("test-passphrase")` and displays the result.

This is throwaway scaffolding — the point is to verify `@feedzero/core` imports work in the Hermes runtime under Expo. If they do, Phase 2 is done and Phase 3 can begin.

**Done when:** `cd packages/mobile && npm run ios` opens the simulator and shows "Vault opened: true".

## Phase 3 onward

Phase 3 (~5–6 weeks of UI work), Phase 4 (~2 weeks of RevenueCat/StoreKit integration), Phase 5 (~2 weeks of submission prep), and Phase 6 (~1 week of launch coordination) are out of scope for this runbook — they get their own runbook (or feature doc per `docs/features/TEMPLATE.md`) once Phase 2 is complete and the actual mobile codebase exists. Re-read the plan file or [ADR 023](../decisions/023-native-ios-via-react-native.md) for the full picture.

The release coordination in Phase 6 follows the existing two-repo pattern from the `new-release` skill: `feedzero-landing` deploys first (Downloads section + bento page + `releases.mjs` entry + AASA file confirmation), then this repo bumps version, then the App Store build flips from "Pending Developer Release" to live.

## Open question parked from ADR 023

Cross-platform subscription identity. Default: iOS paid tiers require sync to be enabled (email becomes the cross-platform key). Revisit during Phase 4 if it depresses conversion. Documented in the ADR's "Decision" section, no action needed until Phase 4.
