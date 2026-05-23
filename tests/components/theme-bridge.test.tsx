import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, useTheme } from "next-themes";
import { ThemeBridge } from "@/components/theme-bridge";
import { usePreferencesStore } from "@/stores/preferences-store";
import { DEFAULT_PREFERENCES } from "@/types";

function CurrentTheme() {
  const { theme } = useTheme();
  return <span data-testid="current-theme">{theme ?? ""}</span>;
}

function renderWithBridge() {
  return render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThemeBridge />
      <CurrentTheme />
    </ThemeProvider>,
  );
}

describe("ThemeBridge", () => {
  beforeEach(() => {
    // Reset the preferences store to a deterministic baseline. The bridge
    // should observe subsequent setState calls.
    usePreferencesStore.setState({
      preferences: { ...DEFAULT_PREFERENCES },
      hydrated: false,
    });
    // next-themes persists to localStorage and the .dark class on
    // <html> survives across renders. Clear both so each test starts
    // from a clean slate.
    try {
      localStorage.removeItem("theme");
    } catch {
      /* localStorage may be unavailable */
    }
    document.documentElement.classList.remove("dark");
  });

  it("does not override next-themes before the preferences store hydrates", () => {
    // Boot ordering: ThemeProvider's first-paint script runs before the DB
    // opens. The bridge must not fire setTheme until preferences hydrate,
    // otherwise it would clobber whatever next-themes inferred (system OS
    // preference, last-session localStorage) with the React-default value.
    renderWithBridge();
    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
  });

  it("applies the vault theme to next-themes once preferences hydrate", () => {
    renderWithBridge();
    act(() => {
      usePreferencesStore.setState({
        preferences: { ...DEFAULT_PREFERENCES, theme: "dark" },
        hydrated: true,
      });
    });
    expect(screen.getByTestId("current-theme")).toHaveTextContent("dark");
  });

  it("re-applies whenever the vault theme changes (cross-device pull)", () => {
    renderWithBridge();
    act(() => {
      usePreferencesStore.setState({
        preferences: { ...DEFAULT_PREFERENCES, theme: "dark" },
        hydrated: true,
      });
    });
    act(() => {
      usePreferencesStore.setState({
        preferences: { ...DEFAULT_PREFERENCES, theme: "system" },
        hydrated: true,
      });
    });
    expect(screen.getByTestId("current-theme")).toHaveTextContent("system");
  });

  it("leaves next-themes alone when the vault has no theme opinion", () => {
    // A vault row without a theme field (legacy migrants, or never-toggled
    // users) must NOT force next-themes back to the default — that would
    // ignore a local-only preference the user set this device.
    renderWithBridge();
    act(() => {
      usePreferencesStore.setState({
        preferences: { ...DEFAULT_PREFERENCES, theme: undefined },
        hydrated: true,
      });
    });
    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
  });
});
