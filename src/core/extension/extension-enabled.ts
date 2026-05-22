/**
 * Build-time switch for the companion browser extension surface.
 *
 * The extension itself is built and unit-tested, but it is NOT yet
 * distributed (no Chrome Web Store / AMO listing, no marketing install
 * page). Until it ships, the reader pane must not advertise it: a
 * "Install the FeedZero extension" button that 404s, or an "Authorize
 * <publisher>" button with nothing to talk to, is worse than no button.
 *
 * Default OFF. When the extension is published, set
 * `VITE_EXTENSION_ENABLED=1` in the deploy environment before
 * `npm run build:all` to reveal the install/authorize CTAs. Paywall
 * detection + the "Open original" fallback ship regardless of this flag.
 *
 * Strict equality with the literal string `"1"` matches the convention
 * used by `self-hosted.ts` / `paid-tier-active.ts` / `flags.ts`.
 *
 * Single-purpose function (not a constant) so tests can stub
 * `import.meta.env` per-case via `vi.stubEnv`.
 */
export function isExtensionEnabled(): boolean {
  return import.meta.env.VITE_EXTENSION_ENABLED === "1";
}
