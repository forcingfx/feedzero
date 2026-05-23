import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { RulesEditorDialog } from "@/components/rules/rules-editor-dialog.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import type { Feed, Rule } from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => {
  const feeds = new Map<string, Feed>();
  return {
    getFeed: vi.fn(async (id: string) => {
      const f = feeds.get(id);
      return f
        ? { ok: true as const, value: f }
        : { ok: false as const, error: "not found" };
    }),
    getFeeds: vi.fn(async () => ({ ok: true, value: [...feeds.values()] })),
    updateFeed: vi.fn(async (f: Feed) => {
      feeds.set(f.id, f);
      return { ok: true, value: true };
    }),
    addFolder: vi.fn(),
    getFolders: vi.fn(async () => ({ ok: true, value: [] })),
    updateFolder: vi.fn(),
    removeFolder: vi.fn(),
    removeFeed: vi.fn(),
    _seed: (f: Feed) => feeds.set(f.id, f),
    _reset: () => feeds.clear(),
  };
});

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
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("@/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: () => true,
}));

import * as db from "@/core/storage/db.ts";
const dbMock = db as unknown as {
  _seed: (f: Feed) => void;
  _reset: () => void;
};

function feed(rules: Rule[] = []): Feed {
  return {
    id: "f1",
    url: "https://example.com/feed.xml",
    title: "Tech Crunchies",
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
    rules,
  };
}

function muteRule(name = "Mute sponsored"): Rule {
  return {
    id: "r-1",
    name,
    enabled: true,
    condition: {
      kind: "group",
      match: "all",
      children: [{ kind: "title", op: "contains", value: "sponsored" }],
    },
    actions: [{ kind: "mute" }],
    createdAt: 0,
    updatedAt: 0,
  };
}

function renderDialog() {
  return render(
    <MemoryRouter>
      <RulesEditorDialog />
    </MemoryRouter>,
  );
}

describe("RulesEditorDialog", () => {
  beforeEach(() => {
    dbMock._reset();
    useLicenseStore.setState({ tier: "personal" });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      rulesEditorFeedId: null,
    });
  });

  it("does not render any dialog when rulesEditorFeedId is null", () => {
    renderDialog();
    expect(screen.queryByTestId("rules-editor-dialog")).toBeNull();
  });

  it("opens with the feed's title in the header when rulesEditorFeedId is set", () => {
    const f = feed();
    useFeedStore.setState({ feeds: [f], rulesEditorFeedId: "f1" });
    renderDialog();
    expect(screen.getByTestId("rules-editor-dialog")).toBeInTheDocument();
    expect(screen.getByText(/Tech Crunchies/)).toBeInTheDocument();
  });

  it("shows an empty state when the feed has no rules", () => {
    useFeedStore.setState({ feeds: [feed()], rulesEditorFeedId: "f1" });
    renderDialog();
    expect(screen.getByTestId("rules-empty-state")).toBeInTheDocument();
  });

  it("lists existing rules with their name and a summary of actions", () => {
    useFeedStore.setState({
      feeds: [feed([muteRule("Hide sponsored")])],
      rulesEditorFeedId: "f1",
    });
    renderDialog();
    const items = screen.getAllByTestId("rule-list-item");
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent("Hide sponsored");
    expect(items[0]).toHaveTextContent("mute");
  });

  it("enters edit mode when 'Add rule' is clicked", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [feed()], rulesEditorFeedId: "f1" });
    renderDialog();
    await user.click(screen.getByTestId("rule-add"));
    expect(screen.getByTestId("rule-name-input")).toBeInTheDocument();
  });

  it("disables Save when the rule has no name or no actions", async () => {
    const user = userEvent.setup();
    useFeedStore.setState({ feeds: [feed()], rulesEditorFeedId: "f1" });
    renderDialog();
    await user.click(screen.getByTestId("rule-add"));
    const save = screen.getByTestId("rule-save");
    expect(save).toBeDisabled();
  });

  it("creates a new rule when Save is clicked with a name + action", async () => {
    const user = userEvent.setup();
    const f = feed();
    dbMock._seed(f);
    useFeedStore.setState({ feeds: [f], rulesEditorFeedId: "f1" });
    renderDialog();

    await user.click(screen.getByTestId("rule-add"));
    await user.type(screen.getByTestId("rule-name-input"), "Mute spam");

    await user.click(screen.getByTestId("rule-action-add"));
    await user.click(screen.getByText("Mute"));

    const save = screen.getByTestId("rule-save");
    expect(save).not.toBeDisabled();
    await user.click(save);

    // After save we return to the list view; the new rule appears.
    expect(screen.getByTestId("rule-list-item")).toBeInTheDocument();
    expect(screen.getByText("Mute spam")).toBeInTheDocument();
  });
});
