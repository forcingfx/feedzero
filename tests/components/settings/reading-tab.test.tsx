/**
 * <ReadingTab> — reading preferences inside Settings.
 *
 * Folds in what used to live in the sidebar SettingsMenu dropdown:
 *   - Group article floods (toggle, persists via useAppStore)
 *   - Auto-organize feeds (button that opens the existing
 *     AutoOrganizeDialog — kept as own modal; not inlined here)
 *
 * The Auto-organize launcher is gated by hasFeeds: there's nothing to
 * organize on a brand-new account.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ReadingTab } from "@/components/settings/tabs/reading-tab";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";
import {
  useSignalModeStore,
  useSignalMode,
  useSignalNightlyRefresh,
} from "@/lib/signal-mode-preference";

/** ReadingTab embeds RulesAuditPanel, which uses useFeatureGate →
 *  useNavigate, so the component tree needs router context. */
function renderTab() {
  return render(
    <MemoryRouter>
      <ReadingTab />
    </MemoryRouter>,
  );
}

vi.mock("@/components/folders/auto-organize-dialog", () => ({
  AutoOrganizeDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="auto-organize-dialog-open" /> : null,
}));

describe("<ReadingTab>", () => {
  beforeEach(() => {
    useAppStore.setState({ groupArticleFloods: false });
    useFeedStore.setState({ feeds: [] });
    localStorage.clear();
    // Reset the signal-mode store to defaults between tests so writes
    // from prior tests don't bleed across files.
    useSignalModeStore.setState({ mode: "ml", hidden: false, nightly: false });
  });

  it("renders a Group floods toggle reflecting useAppStore state", () => {
    useAppStore.setState({ groupArticleFloods: true });
    renderTab();
    const toggle = screen.getByRole("switch", { name: /group article floods/i });
    expect(toggle).toBeChecked();
  });

  it("clicking the Group floods toggle flips useAppStore", () => {
    renderTab();
    fireEvent.click(screen.getByRole("switch", { name: /group article floods/i }));
    expect(useAppStore.getState().groupArticleFloods).toBe(true);
  });

  it("Auto-organize button is hidden when there are no feeds (nothing to organize)", () => {
    renderTab();
    expect(
      screen.queryByRole("button", { name: /auto-organize/i }),
    ).toBeNull();
  });

  it("Auto-organize button is visible when there are feeds", () => {
    useFeedStore.setState({
      feeds: [
        {
          id: "f1",
          url: "https://x.com/r",
          title: "F",
          description: "",
          siteUrl: "",
          createdAt: 0,
          updatedAt: 0,
        },
      ] as never,
    });
    renderTab();
    expect(
      screen.getByRole("button", { name: /auto-organize/i }),
    ).toBeInTheDocument();
  });

  it("clicking Auto-organize opens the AutoOrganizeDialog", () => {
    useFeedStore.setState({
      feeds: [
        {
          id: "f1",
          url: "https://x.com/r",
          title: "F",
          description: "",
          siteUrl: "",
          createdAt: 0,
          updatedAt: 0,
        },
      ] as never,
    });
    renderTab();
    fireEvent.click(screen.getByRole("button", { name: /auto-organize/i }));
    expect(screen.getByTestId("auto-organize-dialog-open")).toBeInTheDocument();
  });

  /**
   * The Signal section is the new home of what used to be the
   * standalone "Briefings" tab. Mode toggle is always visible; the
   * AI-specific controls (API key, model, nightly) only render when
   * mode === "ai" so a Local-mode user doesn't see Anthropic plumbing
   * they don't need.
   */
  describe("Signal section", () => {
    it("renders the Signal section header", () => {
      renderTab();
      expect(screen.getByRole("heading", { name: /^signal$/i })).toBeInTheDocument();
    });

    it("renders the mode toggle with Local and AI options", () => {
      renderTab();
      expect(
        screen.getByRole("radio", { name: /^local$/i }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("radio", { name: /^ai$/i }),
      ).toBeInTheDocument();
    });

    it("hides the API key / model / nightly controls while mode is Local", () => {
      renderTab();
      // Save button is unique to the AnthropicKeyPanel.
      expect(screen.queryByRole("button", { name: /^save$/i })).toBeNull();
      // Briefing-model radios live in the ModelPanel.
      expect(
        screen.queryByRole("radio", { name: /sonnet|haiku|opus/i }),
      ).toBeNull();
      expect(
        screen.queryByRole("switch", { name: /refresh signal nightly/i }),
      ).toBeNull();
    });

    it("shows the API key / model / nightly controls after switching to AI", async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole("radio", { name: /^ai$/i }));
      expect(
        screen.getByRole("button", { name: /^save$/i }),
      ).toBeInTheDocument();
      // One radio per BRIEFING_MODELS entry (Haiku, Sonnet, Opus).
      expect(
        screen.getAllByRole("radio", { name: /sonnet|haiku|opus/i }).length,
      ).toBeGreaterThan(0);
      expect(
        screen.getByRole("switch", { name: /refresh signal nightly/i }),
      ).toBeInTheDocument();
    });

    it("clicking the AI radio updates the signal-mode store", async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole("radio", { name: /^ai$/i }));
      // Using getState() on a Zustand store is fine — state is the
      // store's observable output (CLAUDE.md store-tests rule).
      expect(useSignalModeStore.getState().mode).toBe("ai");
    });

    it("flipping the nightly switch flips the preference", async () => {
      const user = userEvent.setup();
      // Pre-set AI mode so the nightly switch is visible.
      act(() => useSignalModeStore.setState({ mode: "ai" }));
      renderTab();
      await user.click(
        screen.getByRole("switch", { name: /refresh signal nightly/i }),
      );
      expect(useSignalModeStore.getState().nightly).toBe(true);
    });
  });
});

// These end-of-file hooks would normally be dead imports; they exist so
// the test file fails loudly if either selector hook is renamed without
// updating the Signal section that depends on them.
void useSignalMode;
void useSignalNightlyRefresh;
