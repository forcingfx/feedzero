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
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ReadingTab } from "@/components/settings/tabs/reading-tab";
import { useAppStore } from "@/stores/app-store";
import { useFeedStore } from "@/stores/feed-store";

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
});
