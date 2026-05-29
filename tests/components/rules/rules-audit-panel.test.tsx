import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RulesAuditPanel } from "@/components/settings/tabs/rules-audit-panel";
import { useFeedStore } from "@/stores/feed-store";
import type { Feed, Rule } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeed: vi.fn(),
  updateFeed: vi.fn(),
  addFolder: vi.fn(),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateFolder: vi.fn(),
  removeFolder: vi.fn(),
  removeFeed: vi.fn(),
}));

vi.mock("@/core/feeds/feed-service.ts", () => ({
  addFeedFlow: vi.fn(),
  refreshFeed: vi.fn(),
  refreshAllFeeds: vi.fn(),
  reloadFeed: vi.fn(),
}));

vi.mock("@/core/extractor/prefetch-service.ts", () => ({
  prefetchStarredArticles: vi.fn(),
}));

vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

function feed(id: string, title: string, rules: Rule[] = []): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    title,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
    rules,
  };
}

function rule(id: string, name: string, enabled = true): Rule {
  return {
    id,
    name,
    enabled,
    condition: { kind: "group", match: "all", children: [] },
    actions: [{ kind: "mute" }],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("RulesAuditPanel", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [],
      folders: [],
      rulesEditorFeedId: null,
    });
  });

  it("renders an empty state when no feed has any rules", () => {
    render(
      <MemoryRouter>
        <RulesAuditPanel />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("rules-audit-empty")).toBeInTheDocument();
  });

  it("renders one group per feed that has rules, with each rule listed", () => {
    useFeedStore.setState({
      feeds: [
        feed("f1", "Tech Crunchies", [rule("r1", "Mute sponsored")]),
        feed("f2", "Plain Feed"),
        feed("f3", "News Mix", [
          rule("r2", "Star Bret"),
          rule("r3", "Hide press releases", false),
        ]),
      ],
      folders: [],
    });

    render(
      <MemoryRouter>
        <RulesAuditPanel />
      </MemoryRouter>,
    );

    const groups = screen.getAllByTestId("rules-audit-feed-group");
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveTextContent("Tech Crunchies");
    expect(groups[1]).toHaveTextContent("News Mix");

    const items = screen.getAllByTestId("rules-audit-rule");
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining("Mute sponsored"),
      expect.stringContaining("Star Bret"),
      expect.stringContaining("Hide press releases"),
    ]);

    // Disabled rule shows a "paused" marker.
    const lastRule = items[2];
    expect(lastRule).toHaveTextContent("paused");
  });

  it("Edit button calls openRulesEditor with the feed id", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed("f1", "Tech Crunchies", [rule("r1", "Mute sponsored")])],
      folders: [],
    });
    render(
      <MemoryRouter>
        <RulesAuditPanel />
      </MemoryRouter>,
    );
    await user.click(
      screen.getByRole("button", { name: /Edit rules for Tech Crunchies/i }),
    );
    expect(useFeedStore.getState().rulesEditorFeedId).toBe("f1");
  });

  it("Run-now button invokes applyRuleToExistingArticles for that rule", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({
      feeds: [feed("f1", "Tech Crunchies", [rule("r1", "Mute sponsored")])],
      folders: [],
    });
    const spy = vi
      .spyOn(useFeedStore.getState(), "applyRuleToExistingArticles")
      .mockResolvedValue({ ok: true, value: { changed: 2, total: 10 } });

    render(
      <MemoryRouter>
        <RulesAuditPanel />
      </MemoryRouter>,
    );
    await user.click(screen.getByTestId("rules-audit-run-now-r1"));
    expect(spy).toHaveBeenCalledWith("f1", "r1");
  });
});
