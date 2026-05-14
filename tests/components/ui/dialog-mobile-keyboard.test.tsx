/**
 * Structural assertions for DialogContent's mobile-keyboard handling.
 *
 * Background (2026-05-13 user report): on mobile, opening any dialog with a
 * text input — sync setup, onboarding passphrase confirm, restore-from-cloud
 * — caused the virtual keyboard to cover the input. Root cause: the shadcn
 * primitive in `src/components/ui/dialog.tsx` uses `position: fixed` +
 * `top: 50%` centered with no max-height. iOS Safari and Chrome Android
 * don't shrink the layout viewport when the soft keyboard opens, and they
 * don't auto-scroll fixed elements into view.
 *
 * Fix invariant: DialogContent's classNames must include
 *   - `max-h-[calc(100dvh-2rem)]` — dvh shrinks with keyboard on supporting
 *      browsers (iOS Safari 15.4+, Chrome 108+, Firefox 101+).
 *   - `overflow-y-auto` — once max-height is hit, content scrolls so a
 *      focused input can `scrollIntoView` even on older browsers.
 *
 * Why a Tier-2 structural test instead of a behavioral one: Playwright
 * cannot reliably trigger the soft keyboard on real-device emulation, and
 * jsdom/happy-dom don't simulate visual viewport at all. The next-best
 * regression guard is asserting the CSS classes that produce the fix.
 * If a future shadcn upgrade rewrites these classes, this test fails
 * before any user notices the regression.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

function mountOpenDialog() {
  return render(
    <Dialog open>
      <DialogContent>
        <DialogTitle>Test</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
}

describe("DialogContent — mobile keyboard cover prevention", () => {
  it("includes max-h based on dynamic viewport (dvh) so the dialog shrinks with the keyboard", () => {
    const { baseElement } = mountOpenDialog();
    const content = baseElement.querySelector('[role="dialog"]');
    expect(content).toBeTruthy();
    const className = content?.getAttribute("class") ?? "";
    expect(className).toMatch(/max-h-\[calc\(100dvh-2rem\)\]/);
  });

  it("includes overflow-y-auto so focused inputs can scroll into view", () => {
    const { baseElement } = mountOpenDialog();
    const content = baseElement.querySelector('[role="dialog"]');
    const className = content?.getAttribute("class") ?? "";
    expect(className).toContain("overflow-y-auto");
  });

  it("anchors top to 50dvh (dynamic viewport), NOT 50% of the layout viewport", () => {
    // Follow-up to PR #44 (2026-05-14 user report): the original fix made
    // the dialog SIZE keyboard-aware via max-h: 100dvh, but POSITION stayed
    // at top: 50% of the layout viewport. On iOS Safari the layout viewport
    // extends behind the keyboard, so the dialog's center sat mid-layout-
    // viewport (visually too low when keyboard is up). Result: input was
    // visible but the buttons below it (Back / Enable sync) were hidden
    // behind the keyboard.
    //
    // Fix: top-[50dvh] tracks the dynamic viewport — when keyboard opens
    // and dvh shrinks, the dialog's center moves up to stay in the visible
    // area. Combined with translate-y: -50%, the dialog ends up centered
    // in the visible area above the keyboard.
    const { baseElement } = mountOpenDialog();
    const content = baseElement.querySelector('[role="dialog"]');
    const className = content?.getAttribute("class") ?? "";
    expect(className).toMatch(/top-\[50dvh\]/);
    // The bug was specifically `top-[50%]` — assert it's gone.
    expect(className).not.toMatch(/top-\[50%\]/);
  });
});
