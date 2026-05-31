/**
 * Build-identifying version string for display in the UI.
 *
 * Baked at build time by Vite's `VITE_APP_VERSION` define, which is sourced
 * from package.json (see vite.config.js). The serverless side reports the
 * same number via `process.env.APP_VERSION` (scripts/build-api.js) and the
 * `/api/health` endpoint; this accessor is the browser/UI counterpart so the
 * Settings screen can show which build is running.
 *
 * Falls back to "dev" when the define is absent — e.g. unit tests, where
 * Vitest does not apply the Vite `define` — so the UI always shows something
 * concrete instead of `undefined`. Mirrors the defensive read in
 * health-handler.ts so neither path crashes when `import.meta.env` is missing.
 */
export function getAppVersion(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> })
      .env;
    const version = env?.VITE_APP_VERSION;
    return typeof version === "string" && version.length > 0 ? version : "dev";
  } catch {
    return "dev";
  }
}
