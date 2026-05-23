# @feedzero/core

Placeholder. See [ADR 023](../../docs/decisions/023-native-ios-via-react-native.md).

This package will eventually own the framework-agnostic modules currently at
`src/core/`, `src/stores/`, `src/utils/`, and `src/types/`. Nothing has moved
yet — this directory exists so the workspace topology is wired up and future
extraction PRs can land file moves without touching the workspace config.

Three platform adapters will be introduced here during Phase 2 of the iOS
rollout:

- `StorageBackend` — wraps Dexie/IndexedDB (web) and SQLite (mobile).
- `CryptoBackend` — wraps `crypto.subtle` (web) and `react-native-quick-crypto` (mobile).
- `KeyValueStore` — wraps `localStorage` (web) and `react-native-mmkv` (mobile).

Until those land, `@feedzero/core` exports nothing.
