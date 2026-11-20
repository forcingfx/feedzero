import { existsSync, readFileSync } from "node:fs";

/**
 * Parse a `.env`-style file into key/value pairs. Handles double-quoted
 * values (the format `vercel env pull` writes) so values containing shell
 * metacharacters survive without being mangled by `source` / `sed`.
 * Strips a single layer of surrounding `"..."` if present; leaves
 * unquoted values as-is.
 */
export function loadEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of readFileSync(path, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Load `path` into `env` without overriding variables already set, so a
 * value exported in the shell wins over the pulled file. No-op when the
 * file is absent: every operator CLI accepts the key from the shell too.
 */
export function applyEnvFileIfPresent(
  path: string,
  env: Record<string, string | undefined>,
): void {
  if (!existsSync(path)) return;
  for (const [key, value] of Object.entries(loadEnvFile(path))) {
    if (!env[key]) env[key] = value;
  }
}
