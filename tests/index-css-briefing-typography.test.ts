/**
 * Regression guard: the briefing abstract surface (BriefingAbstract) renders
 * model-produced markdown inside a `prose prose-sm dark:prose-invert` wrapper.
 * Those classes only do anything when `@tailwindcss/typography` is registered
 * with the Tailwind v4 build via `@plugin` in src/index.css. Without it the
 * classes are silent no-ops and Tailwind's preflight reset strips the default
 * h2 / ul / li / p styling — headings render as plain inline text, bullets run
 * together as paragraphs, citation chips trail the previous line. That is the
 * exact symptom from the 2026-05-25 mobile-briefing screenshot.
 *
 * happy-dom doesn't compute Tailwind-generated CSS, and a Playwright E2E for
 * briefings would need a Pro license + Anthropic key to materialize a real
 * report. The next-best guard is asserting the CSS source registers the plugin.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_CSS = readFileSync(
  resolve(__dirname, "..", "src", "index.css"),
  "utf-8",
);

describe("index.css — briefing typography plugin", () => {
  it("registers @tailwindcss/typography so prose classes resolve to real styles", () => {
    expect(INDEX_CSS).toMatch(
      /@plugin\s+["']@tailwindcss\/typography["']/,
    );
  });
});
