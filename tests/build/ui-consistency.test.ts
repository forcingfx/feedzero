// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Pin-tests for a calm, consistent surface (audit 2026-Q4, finding 3).
 *
 * Product decisions these freeze:
 * - Status colour comes from semantic tokens (`success`, `warning`, `info`,
 *   `destructive`, `primary`), never from a raw Tailwind hue. Hand-picked
 *   ambers and emeralds drifted into about 150 sites with no shared
 *   meaning, and each needed its own dark-mode twin.
 * - 12 px (`text-xs`) is the smallest text. Labels at 9–11 px were not
 *   readable on a phone.
 * - Every icon-only button has an accessible name.
 *
 * - Round 2: header actions are ghost icon `Button`s with a tooltip, like
 *   every other icon action in the app. The bespoke circle-to-pill
 *   primitive (`ExpandingPill`) hid its label until hover and gave the
 *   title bar a second button vocabulary; it is gone.
 *
 * The allowlist names the one file that draws data, not status.
 */
import { existsSync } from "node:fs";
const root = path.resolve(__dirname, "../..");
const UI_DIRS = ["src/components", "src/pages"];
const RAW_HUE =
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via)-(?:amber|emerald|violet|green|red|blue|sky|rose|orange|yellow|indigo|purple|pink|teal|cyan|lime)-\d{2,3}(?:\/\d+)?\b/g;
const TINY_TEXT = /\btext-\[(?:9|10|11)px\]/g;
const PALETTE_ALLOWLIST = new Set([
  "src/components/briefings/signal-score-gauge.tsx", // a gauge: colour encodes a value
]);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, entry);
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.tsx?$/.test(entry) && !rel.includes("/ui/")) out.push(rel);
  }
  return out;
}

const files = UI_DIRS.flatMap(sourceFiles);
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("UI consistency", () => {
  it("uses semantic colour tokens, not raw Tailwind hues", () => {
    const offenders = files
      .filter((f) => !PALETTE_ALLOWLIST.has(f))
      .flatMap((f) => (read(f).match(RAW_HUE) ?? []).map((m) => `${f}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("never sets text below 12 px", () => {
    const offenders = files.flatMap((f) => (read(f).match(TINY_TEXT) ?? []).map((m) => `${f}: ${m}`));
    expect(offenders).toEqual([]);
  });

  it("has no second button vocabulary: ExpandingPill is gone", () => {
    expect(existsSync(path.join(root, "src/components/ui/expanding-pill.tsx"))).toBe(false);
    const importers = files.filter((f) => /expanding-pill/.test(read(f)));
    expect(importers).toEqual([]);
  });

  it("gives every icon-only button an accessible name", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const lines = read(f).split("\n");
      lines.forEach((line, i) => {
        if (!/size="icon"/.test(line)) return;
        const window = lines.slice(Math.max(0, i - 4), i + 12).join("\n");
        if (!/aria-label=|title=|sr-only|aria-labelledby=/.test(window)) offenders.push(`${f}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
