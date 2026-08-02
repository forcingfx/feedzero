import { describe, it, expect, afterEach } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner.tsx";

/**
 * The Toaster used to hardcode theme="light" with inverted dark-on-light
 * CSS variables, so toasts ignored the app theme entirely. It must follow
 * next-themes like every other surface.
 *
 * Sonner only mounts its `[data-sonner-toaster]` list once a toast fires,
 * so each test emits one before asserting.
 */
describe("Toaster theming", () => {
  afterEach(() => {
    act(() => {
      toast.dismiss();
    });
  });

  it("follows the app theme instead of hardcoding light", async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <Toaster />
      </ThemeProvider>,
    );
    act(() => {
      toast("Theme check");
    });

    await waitFor(() => {
      const toaster = document.querySelector("[data-sonner-toaster]");
      expect(toaster).not.toBeNull();
      expect(toaster!.getAttribute("data-sonner-theme")).toBe("dark");
    });
  });

  it("uses theme tokens for toast colors, not hardcoded hex values", async () => {
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <Toaster />
      </ThemeProvider>,
    );
    act(() => {
      toast("Token check");
    });

    await waitFor(() => {
      const toaster = document.querySelector(
        "[data-sonner-toaster]",
      ) as HTMLElement | null;
      expect(toaster).not.toBeNull();
      const style = toaster!.getAttribute("style") ?? "";
      // The old wrapper pinned zinc-900 (#18181b) backgrounds regardless of
      // theme; colors must come from the design tokens instead.
      expect(style).not.toContain("#18181b");
      expect(style).toContain("var(--popover)");
    });
  });
});
