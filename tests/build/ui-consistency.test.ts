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
 * - Round 2: every page title (`<h1>`) is `text-xl`. Nine titles were
 *   2xl, five xl and two lg with no rule behind the difference.
 * - Round 2: the destructive button variant appears only inside a
 *   confirm dialog (Dialog / AlertDialog). A red button on a page is
 *   a threat; inside a confirmation it is the answer to a question.
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

  it("sets every page title to text-xl", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = read(f);
      const re = /<h1\b[^>]*className="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        if (!/\btext-xl\b/.test(m[1])) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("uses the destructive button variant only inside confirm dialogs", () => {
    const offenders = files.filter((f) => {
      const src = read(f);
      const hasDestructiveButton = /<Button\b[^>]*variant="destructive"/s.test(src.replace(/\n\s*/g, " "));
      const inDialog = /from "@\/components\/ui\/(alert-)?dialog(\.tsx)?"/.test(src);
      return hasDestructiveButton && !inDialog;
    });
    expect(offenders).toEqual([]);
  });

  it("defines one glass treatment with an opaque fallback for reduced transparency", () => {
    const css = readFileSync(path.join(root, "src/index.css"), "utf8");
    const glass = css.match(/\.glass-bar\s*\{[^}]*\}/)?.[0] ?? "";
    expect(glass).toMatch(/backdrop-filter/);
    expect(glass).toMatch(/-webkit-backdrop-filter/);
    expect(css).toMatch(/prefers-reduced-transparency:\s*reduce[\s\S]*?\.glass-bar/);
  });

  it("defines the liquid-glass capsule with a specular rim and the same opaque fallbacks", () => {
    const css = readFileSync(path.join(root, "src/index.css"), "utf8");
    const glass = css.match(/\.liquid-glass\s*\{[^}]*\}/)?.[0] ?? "";
    expect(glass).toMatch(/backdrop-filter/);
    expect(glass).toMatch(/-webkit-backdrop-filter/);
    expect(glass).toMatch(/inset 0 1px 0/); // the lit top edge
    expect(css).toMatch(/prefers-reduced-transparency:\s*reduce[\s\S]*?\.liquid-glass/);
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
