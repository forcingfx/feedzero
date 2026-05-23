/**
 * Structural assertions for the native-app feel rules in src/index.css.
 *
 * Why this is a content-grep test instead of a computed-style test:
 * happy-dom does not evaluate media queries, `-webkit-*` vendor properties,
 * or `touch-action` against a viewport; jsdom does not implement them at
 * all. A real-browser E2E test cannot observe these either — the iOS-only
 * focus zoom is a property of MobileSafari's heuristic, not the DOM. The
 * next-best regression guard is asserting the CSS source contains the
 * rules that produce the fix.
 *
 * If a future "let's clean up index.css" edit drops these, every mobile
 * input regresses to the iOS focus-zoom (the original 2026-05-23 user
 * report) and every tap regresses to the gray-flash + 300ms delay.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const INDEX_CSS = readFileSync(
  resolve(__dirname, "..", "src", "index.css"),
  "utf-8",
);

describe("index.css — iOS zoom on input focus prevention", () => {
  it("forces form controls to 16px on viewports below the md breakpoint", () => {
    // The root html font-size is 14px, so Tailwind's text-base (1rem)
    // resolves to 14px and trips iOS Safari's "zoom in on focus when
    // input font-size < 16px" heuristic. The CSS rule pins a literal
    // 16px on input/textarea/select/contenteditable below md (768px).
    //
    // Accepts any equivalent ordering of selectors in the rule body.
    const mobileInputRule =
      /@media\s*\(max-width:\s*767px\)[\s\S]*?(?:input|textarea|select|contenteditable)[\s\S]*?font-size:\s*16px/;
    expect(INDEX_CSS).toMatch(mobileInputRule);
  });

  it("covers input, textarea, select and contenteditable in the same rule", () => {
    // Each of these can trigger the iOS zoom. The rule must list them all
    // so a contenteditable comment field or a native <select> doesn't
    // regress.
    expect(INDEX_CSS).toMatch(/input/);
    expect(INDEX_CSS).toMatch(/textarea/);
    expect(INDEX_CSS).toMatch(/select/);
    expect(INDEX_CSS).toMatch(/\[contenteditable/);
  });

  it("places the mobile-input rule OUTSIDE @layer base so it beats Tailwind utilities", () => {
    // Tailwind v4 puts utility classes (text-base, text-sm) into
    // @layer utilities, which beats @layer base in the cascade. The
    // shadcn Input/Textarea apply `text-base md:text-sm` — so a base-
    // layer 16px rule would lose to those utilities and the zoom
    // regression would silently come back.
    //
    // Unlayered CSS wins the cascade against EVERY layered rule, which
    // is the only stable place for this rule. This test guards against
    // a future "let's wrap everything in @layer base for tidiness" edit.
    const baseLayerMatch = INDEX_CSS.match(/@layer base\s*\{[\s\S]*?\n\}/);
    expect(baseLayerMatch).not.toBeNull();
    const baseLayerBody = baseLayerMatch?.[0] ?? "";
    expect(baseLayerBody).not.toMatch(/@media\s*\(max-width:\s*767px\)/);
  });
});

describe("index.css — native-app feel base rules", () => {
  it("disables -webkit-text-size-adjust so iOS landscape doesn't reflow type", () => {
    // Without this, rotating an iPhone to landscape bumps up font sizes
    // automatically and the carefully-tuned text scale breaks.
    expect(INDEX_CSS).toMatch(
      /-webkit-text-size-adjust:\s*100%/,
    );
  });

  it("removes the iOS tap highlight (gray flash on every tap)", () => {
    // The single biggest "this is a web page, not an app" tell on iOS.
    expect(INDEX_CSS).toMatch(
      /-webkit-tap-highlight-color:\s*transparent/,
    );
  });

  it("disables document-root overscroll (pull-to-refresh rubber-band)", () => {
    // Native apps don't bounce the whole document when you scroll past
    // the top/bottom. `overscroll-behavior-y: none` on html/body kills
    // both the rubber-band AND Chrome Android's pull-to-refresh.
    expect(INDEX_CSS).toMatch(
      /overscroll-behavior(-y)?:\s*none/,
    );
  });

  it("declares touch-action: manipulation on interactive elements", () => {
    // Removes the 300ms double-tap-zoom delay that iOS Safari applies
    // to clicks on buttons/links. Crucial for any UI that taps in
    // rapid succession (e.g. j/k-like article navigation taps).
    expect(INDEX_CSS).toMatch(
      /touch-action:\s*manipulation/,
    );
  });
});
