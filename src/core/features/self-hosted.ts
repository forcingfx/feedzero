/**
 * Build-time self-hosted flag.
 *
 * Set `VITE_SELF_HOSTED=1` in `.env.production` (or the environment) before
 * `npm run build:all` to flip the app into self-hosted mode. The honor-system
 * tier gates then bypass — every shipped Personal feature is available
 * regardless of stored license tier. See ADR 012.
 *
 * Strict equality with the literal string `"1"` matches the convention used
 * elsewhere in the codebase (see `src/core/flags/flags.ts`): no ambiguity
 * about whether `"true"` / `"yes"` / `"0"` enable the flag.
 *
 * Single-purpose function (not a constant) so tests can stub
 * `import.meta.env` per-case via `vi.stubEnv`.
 */
export function isSelfHosted(): boolean {
  return import.meta.env.VITE_SELF_HOSTED === "1";
}
