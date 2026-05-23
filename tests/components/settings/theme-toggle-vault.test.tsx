import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "next-themes";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { usePreferencesStore } from "@/stores/preferences-store";
import { DEFAULT_PREFERENCES } from "@/types";

describe("ThemeToggle — vault wiring", () => {
  beforeEach(() => {
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      hydrated: true,
    });
  });

  it("writes the selected theme through usePreferencesStore.update", async () => {
    // Clicking a radio must (1) flip next-themes (already covered) AND
    // (2) write the value through usePreferencesStore so it rides the
    // vault to other devices. Without the second call the toggle would
    // silently revert on a cross-device pull.
    const user = userEvent.setup();
    render(
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <ThemeToggle />
      </ThemeProvider>,
    );
    await user.click(screen.getByRole("radio", { name: /dark/i }));
    expect(usePreferencesStore.getState().preferences.theme).toBe("dark");
  });
});
