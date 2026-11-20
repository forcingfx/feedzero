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
import { render, screen, fireEvent, act, within } from "@testing-library/react";
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

  it("offers the article retention period", () => {
    renderTab();
    expect(screen.getByRole("combobox", { name: /keep articles/i })).toBeInTheDocument();
  });

  describe("text size", () => {
    it("renders a three-way text size control defaulting to Medium", () => {
      renderTab();
      const group = screen.getByRole("group", { name: /text size/i });
      expect(
        within(group).getByRole("button", { name: /^medium$/i }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(group).getByRole("button", { name: /^small$/i }),
      ).toBeInTheDocument();
      expect(
        within(group).getByRole("button", { name: /^large$/i }),
      ).toBeInTheDocument();
    });

    it("selecting Large persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();
      const group = screen.getByRole("group", { name: /text size/i });

      fireEvent.click(within(group).getByRole("button", { name: /^large$/i }));

      expect(
        usePreferencesStore.getState().preferences.readerTextSize,
      ).toBe("large");
      expect(
        within(group).getByRole("button", { name: /^large$/i }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("reading width", () => {
    it("renders a three-way width control defaulting to Medium", () => {
      renderTab();
      const group = screen.getByRole("group", { name: /reading width/i });
      expect(
        within(group).getByRole("button", { name: /^medium$/i }),
      ).toHaveAttribute("aria-pressed", "true");
      expect(
        within(group).getByRole("button", { name: /^narrow$/i }),
      ).toBeInTheDocument();
      expect(
        within(group).getByRole("button", { name: /^wide$/i }),
      ).toBeInTheDocument();
    });

    it("selecting Wide persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();
      const group = screen.getByRole("group", { name: /reading width/i });

      fireEvent.click(within(group).getByRole("button", { name: /^wide$/i }));

      expect(usePreferencesStore.getState().preferences.readerWidth).toBe(
        "wide",
      );
      expect(
        within(group).getByRole("button", { name: /^wide$/i }),
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  describe("issue #341: larger text, full width, line height", () => {
    it("offers an Extra large text size and persists it", async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      renderTab();
      const group = screen.getByRole("group", { name: /text size/i });

      fireEvent.click(within(group).getByRole("button", { name: /^extra large$/i }));

      expect(usePreferencesStore.getState().preferences.readerTextSize).toBe("x-large");
    });

    it("offers a Full reading width and persists it", async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      renderTab();
      const group = screen.getByRole("group", { name: /reading width/i });

      fireEvent.click(within(group).getByRole("button", { name: /^full$/i }));

      expect(usePreferencesStore.getState().preferences.readerWidth).toBe("full");
    });

    it("renders a three-way line spacing control defaulting to Normal", () => {
      renderTab();
      const group = screen.getByRole("group", { name: /line spacing/i });
      expect(within(group).getByRole("button", { name: /^normal$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(within(group).getByRole("button", { name: /^compact$/i })).toBeInTheDocument();
      expect(within(group).getByRole("button", { name: /^relaxed$/i })).toBeInTheDocument();
    });

    it("selecting Relaxed line spacing persists the preference", async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      renderTab();
      const group = screen.getByRole("group", { name: /line spacing/i });

      fireEvent.click(within(group).getByRole("button", { name: /^relaxed$/i }));

      expect(usePreferencesStore.getState().preferences.readerLineHeight).toBe("relaxed");
    });
  });

  describe("issue #342: open articles in", () => {
    it("defaults to Feed text", () => {
      renderTab();
      const group = screen.getByRole("group", { name: /open articles in/i });
      expect(within(group).getByRole("button", { name: /^feed text$/i })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("choosing Full text persists the preference", async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      renderTab();
      const group = screen.getByRole("group", { name: /open articles in/i });

      fireEvent.click(within(group).getByRole("button", { name: /^full text$/i }));

      expect(usePreferencesStore.getState().preferences.openArticlesIn).toBe("full-text");
    });
  });

  describe("issue #340: show article images", () => {
    it("is off by default and names the privacy trade-off", () => {
      renderTab();
      expect(screen.getByRole("switch", { name: /show article images/i })).toHaveAttribute(
        "aria-checked",
        "false",
      );
      expect(screen.getByText(/image host/i)).toBeInTheDocument();
    });

    it("flipping it on persists the preference", async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      renderTab();
      await userEvent.click(screen.getByRole("switch", { name: /show article images/i }));
      expect(usePreferencesStore.getState().preferences.showArticleImages).toBe(true);
    });
  });

  describe("hide read articles", () => {
    it("is off by default", () => {
      renderTab();
      expect(
        screen.getByRole("switch", { name: /hide read articles/i }),
      ).not.toBeChecked();
    });

    it("flipping it on persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();

      fireEvent.click(
        screen.getByRole("switch", { name: /hide read articles/i }),
      );

      expect(
        usePreferencesStore.getState().preferences.hideReadArticles,
      ).toBe(true);
    });
  });

  describe("feed icons in the list", () => {
    it("is on by default", () => {
      renderTab();
      expect(
        screen.getByRole("switch", { name: /show feed icons/i }),
      ).toBeChecked();
    });

    it("flipping it off persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();

      fireEvent.click(screen.getByRole("switch", { name: /show feed icons/i }));

      expect(
        usePreferencesStore.getState().preferences.showArticleFeedIcons,
      ).toBe(false);
    });
  });

  describe("list appearance (user report 2026-11)", () => {
    it("offers a list size control defaulting to Medium", () => {
      renderTab();
      const group = screen.getByRole("group", { name: /list size/i });
      expect(
        within(group).getByRole("button", { name: /^medium$/i }),
      ).toHaveAttribute("aria-pressed", "true");
    });

    it("selecting a Large list persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();
      const group = screen.getByRole("group", { name: /list size/i });

      fireEvent.click(within(group).getByRole("button", { name: /^large$/i }));

      expect(usePreferencesStore.getState().preferences.listTextSize).toBe("large");
    });

    it("shows article previews by default", () => {
      renderTab();
      expect(
        screen.getByRole("switch", { name: /show article preview/i }),
      ).toBeChecked();
    });

    it("turning previews off persists the preference", async () => {
      const { usePreferencesStore } = await import(
        "@/stores/preferences-store.ts"
      );
      renderTab();

      fireEvent.click(screen.getByRole("switch", { name: /show article preview/i }));

      expect(
        usePreferencesStore.getState().preferences.showArticlePreview,
      ).toBe(false);
    });
  });

  describe("article text preview (owner request 2026-11)", () => {
    beforeEach(async () => {
      const { usePreferencesStore } = await import("@/stores/preferences-store.ts");
      const { DEFAULT_PREFERENCES } = await import("@feedzero/core/types");
      usePreferencesStore.setState({ preferences: { ...DEFAULT_PREFERENCES } });
    });

    // The preview is only worth having if it cannot drift from the
    // reader, so it is asserted against the reader's own class builder.
    it("shows sample article text styled by the reader's own classes", async () => {
      const { readerTextClass } = await import(
        "@/components/reader/reader-typography.ts"
      );
      renderTab();

      const preview = screen.getByRole("region", { name: /preview/i });
      expect(within(preview).getByRole("heading")).toBeInTheDocument();
      expect(within(preview).getAllByText(/\w+/).length).toBeGreaterThan(1);
      const column = within(preview).getByTestId("reading-preview-column");
      for (const cls of readerTextClass({ textSize: "medium", lineHeight: "normal" })
        .split(" ")
        .filter(Boolean)) {
        expect(column.className).toContain(cls);
      }
    });

    it("follows text size and line spacing as they change", () => {
      renderTab();
      const column = screen.getByTestId("reading-preview-column");

      fireEvent.click(
        within(screen.getByRole("group", { name: /text size/i })).getByRole("button", {
          name: /^extra large$/i,
        }),
      );
      expect(column.className).toContain("reading-size-x-large");

      fireEvent.click(
        within(screen.getByRole("group", { name: /line spacing/i })).getByRole("button", {
          name: /^relaxed$/i,
        }),
      );
      expect(column.className).toContain("leading-loose");

    });

    // Bug report 2026-11-19: "The width setting doesn't do anything, at
    // least in the preview." The pane is about 700px wide, so the
    // reader's real measures (600 / 720 / 960px / none) all but one
    // exceeded it and looked identical. Pin: the preview draws the width
    // to scale, as a share of the pane, so every option moves the column.
    it("gives each reading width a visibly different column", () => {
      renderTab();
      const column = screen.getByTestId("reading-preview-column");
      const widthGroup = screen.getByRole("group", { name: /reading width/i });
      const seen = new Set<string>();

      for (const name of [/^narrow$/i, /^medium$/i, /^wide$/i, /^full$/i]) {
        fireEvent.click(within(widthGroup).getByRole("button", { name }));
        const scale = column.className.match(/lg:max-w-\S+/)?.[0];
        expect(scale).toBeDefined();
        seen.add(scale!);
      }

      expect(seen.size).toBe(4);
    });

    it("does not apply the reader's real measure, which the pane would swallow", () => {
      renderTab();
      const column = screen.getByTestId("reading-preview-column");
      expect(column.className).not.toMatch(/(^|\s)max-w-(150|180|240)\b/);
    });

    it("says how wide the chosen column really is", () => {
      renderTab();
      const preview = screen.getByRole("region", { name: /preview/i });
      expect(within(preview).getByTestId("reading-preview-width")).toHaveTextContent(
        /720px.*to scale/i,
      );

      fireEvent.click(
        within(screen.getByRole("group", { name: /reading width/i })).getByRole("button", {
          name: /^narrow$/i,
        }),
      );
      expect(within(preview).getByTestId("reading-preview-width")).toHaveTextContent(/600px/);
    });

    it("tells phone readers the width cannot change anything on their screen", () => {
      renderTab();
      const note = screen.getByTestId("reading-preview-narrow-note");
      expect(note).toHaveTextContent(/fills this screen/i);
      // Shown only below the desktop breakpoint, where it is true.
      expect(note.className).toContain("lg:hidden");
      expect(screen.getByTestId("reading-preview-width").className).toContain("max-lg:hidden");
    });

    it("renders the sample through the reader's ArticleContent, links and quotes included", () => {
      renderTab();
      const preview = screen.getByRole("region", { name: /preview/i });
      expect(preview.querySelector("blockquote")).not.toBeNull();
      expect(preview.querySelector("a")).not.toBeNull();
    });

    it("keeps the sample link from navigating away from settings", () => {
      renderTab();
      const link = screen.getByRole("region", { name: /preview/i }).querySelector("a")!;
      expect(link.getAttribute("href")).toBe("#");
      // fireEvent returns false when the click's default was prevented.
      expect(fireEvent.click(link)).toBe(false);
    });
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

  /**
   * Audit 2026-Q4, round 2, rule 2. Settings are rows under headings,
   * not a stack of bordered cards. Each row is a label plus description
   * on the left and its control on the right; headings group the rows by
   * what they change. Pinned because the card stack read as fourteen
   * equal announcements and took three screens on a phone.
   */
  describe("layout: rows under headings", () => {
    it("groups the rows under Appearance, Reading, Feeds and Signal headings", () => {
      renderTab();
      for (const name of [/^appearance$/i, /^reading$/i, /^feeds$/i, /^signal$/i]) {
        expect(screen.getByRole("heading", { name })).toBeInTheDocument();
      }
    });

    it("draws no card chrome around individual settings", () => {
      const { container } = renderTab();
      expect(container.querySelectorAll(".bg-card").length).toBe(0);
    });

    it("keeps Theme as a radiogroup inside the Appearance section", () => {
      renderTab();
      const appearance = screen.getByRole("heading", { name: /^appearance$/i }).closest("section");
      expect(appearance).not.toBeNull();
      expect(within(appearance as HTMLElement).getByRole("radiogroup", { name: /theme/i })).toBeInTheDocument();
    });
  });
});

// These end-of-file hooks would normally be dead imports; they exist so
// the test file fails loudly if either selector hook is renamed without
// updating the Signal section that depends on them.
void useSignalMode;
void useSignalNightlyRefresh;
