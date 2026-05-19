# ADR 018: No Automated Code Path May Delete Server-Side Vault Data

## Status
Accepted (2026-05-19).

## Context

[Issue #117](https://github.com/forcingfx/feedzero/issues/117) chain
was:

1. A response-header leak (ADR 017) truncated vault GET responses on
   self-hosted deployments, producing `JSON.parse: unterminated
   string` errors.
2. A separate `rekeyFromPassphrase` ordering bug
   (`switchToExistingCloud("replace")` path) wrote new keys to
   `localStorage` while leaving the IndexedDB ciphertext encrypted
   under old keys. On the next page load, the canary check
   (`getFeeds()` in `restore()`) failed.
3. `initializeReturningUser` interpreted the failed canary as
   "invalid keys" and called `destroy()` —— which deletes BOTH the
   local IndexedDB AND **issues a DELETE against the server vault**
   via `tryDeleteServerVault()`.

The user-visible result: "the .json file under
`~/feedzero/data/vaults/` deletes itself after syncing to a 2nd
device" (quoted from the issue). The user's entire cloud backup was
gone — destroyed by their own client, at boot, with no warning.

The comment at `src/stores/app-store.ts:42-46` already flagged the
boot-time auto-destroy as a known landmine ("catastrophic data loss
masked as 'sync didn't work'"), but the cascade existed in code and
fired in production.

### Why this is structurally important

This bug pattern is **platform-agnostic**. Self-hosters on the
filesystem adapter hit it because the response-truncation bug above
exposed the latent rekey drift, but the underlying control flow runs
the same way on the hosted backend (Upstash, paid users). The
hosted-backend variant has been a silent ticking risk:

- Every paid user logging in on a second device hits
  `DeviceSetupWizard` →
  `switchToExistingCloud(passphrase, "replace")`. The pre-fix flow
  guarantees the next boot's canary fails.
- That second-boot canary failure issued a DELETE against Upstash and
  the paid user's encrypted vault was gone.

The bug never showed up in production for paid users because (a) we
have few enough paid second-device logins to escape notice, and (b)
the Upstash adapter `del` is the same one-line idempotent call as
filesystem, so the user just sees "no cloud data found" and assumes
they typed the passphrase wrong. Issue #117 is the first time anyone
reported the cascade — and that was only because the self-hosted
deployment also surfaced the header-leak truncation symptom which
made the cascade *visible*.

## Decision

### 1. No automated code path deletes server-side vault data

`destroy()` in `src/core/storage/key-manager.ts` has exactly one
sanctioned caller: `useAppStore.getState().resetApp`. That caller is
wired to an explicit confirmation flow in the UI
(`InvalidKeysScreen` →
`<AlertDialog>` "Wipe this device and start over" → `resetApp`).

The boot-time path (`initializeReturningUser`) now never calls
`destroy()`. Instead:

- `restore()` returns `no-keys` → set `isDbReady: false`,
  `hasCompletedOnboarding: false`. Re-onboarding screen renders.
- `restore()` returns `invalid-keys` → set
  `recoveryMode: "invalid-keys"`. `InvalidKeysScreen` renders. The
  user picks "Restore from cloud" (passphrase →
  `switchToExistingCloud("replace")`) or "Wipe and start over"
  (explicit `<AlertDialog>` confirmation → `resetApp`).

### 2. Key-data coupling is mechanically enforced

`assertKeyDataCoupling()` in `src/core/storage/key-manager.ts` is a
runtime invariant check that reads one record using current in-memory
keys. It's called at the end of every flow that touches encryption
keys:

- `initFresh` — after `open(passphrase)` and `storeKeys`.
- `applyCloudVault` (the new helper) — after close + delete + open +
  importVault + persist.

Any operation that modifies stored keys without re-encrypting data,
or re-encrypts data without updating stored keys, surfaces an `err`
to the caller instead of silently corrupting state. CLAUDE.md's
"key-data coupling invariant" is now enforced in code, not just docs.

### 3. The rekey footgun is gone

`rekeyFromPassphrase` was renamed `persistDerivedKeysFromOpenDb` to
reveal the precondition (the DB must already be open with keys
derived from the passphrase). The two callers in `sync-store.ts`
went from `importVault → rekey` (broken: encrypts under OLD keys,
writes NEW keys) to a consolidated `applyCloudVault` helper that:

1. Pulls the cloud vault into memory (read-only; doesn't touch local).
2. `close()` the open DB.
3. `deleteDatabase()` — wipes local data encrypted under old keys.
4. `open(passphrase)` — opens a fresh DB with NEW keys derived from
   the cloud passphrase. In-memory `cryptoKey` / `hmacKey` are now
   the new keys.
5. `importVault(...)` — encrypts the cloud data under the new keys.
6. `persistDerivedKeysFromOpenDb` — writes the matching JWKs to
   `localStorage`.
7. `assertKeyDataCoupling()` — verifies the invariant.
8. Refresh `feed-store` and `article-store` in-memory state so the UI
   reflects the imported data immediately.

If pull (step 1) fails, the destructive sequence never starts. If
import (step 5) fails, the pulled vault is still in memory and the
user can retry.

### 4. Recovery has UI, not just an error string

`InvalidKeysScreen` (`src/components/recovery/invalid-keys-screen.tsx`)
renders when `recoveryMode === "invalid-keys"`. It offers exactly two
buttons: "Restore from cloud" (passphrase input → `applyCloudVault`)
and "Wipe this device and start over" (explicit `<AlertDialog>` →
`resetApp`). Neither is automatic. Tested at the unit level
(`tests/components/recovery/invalid-keys-screen.test.tsx`) including
the assertion that `resetApp` is **not** called until the confirmation
button is clicked.

## Consequences

- A user with corrupted localStorage, an interrupted browser
  migration, or a transient IndexedDB glitch sees a recovery screen
  instead of silent data loss.
- Paid users on Upstash are now safe from the second-device-login
  vault-deletion regression that's been latent since
  `switchToExistingCloud("replace")` first shipped.
- The `destroy()` JSDoc carries a warning that any new caller must
  prove user-confirmation. This is policy, not just structure — code
  review enforces it.
- The previous test
  (`tests/stores/app-store.test.ts`'s "forces re-onboarding when
  keys are invalid") was rewritten to assert the OPPOSITE invariant
  (`expect(destroy).not.toHaveBeenCalled()`). Anyone trying to
  reinstate the auto-destroy path needs to delete this test, which
  is a visible signal in code review.

## Related

- Issue [#117](https://github.com/forcingfx/feedzero/issues/117).
- Incident
  [2026-05-19-sync-cascade.md](../incidents/2026-05-19-sync-cascade.md).
- ADR [017](./017-adapter-concurrency-contract.md) — the
  response-truncation half of #117.
- CLAUDE.md "Pull-before-mutate invariant" and "Key-data coupling
  invariant" — this ADR converts both from prose to enforced code.
