import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { SmartFilterEditorDialog } from "@/components/smart-filters/smart-filter-editor-dialog.tsx";
import { useSmartFilterStore } from "@/stores/smart-filter-store.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { useLicenseStore } from "@/stores/license-store.ts";
import type {
  SmartFilter,
  Article,
  Feed,
  ConditionGroup,
} from "@feedzero/core/types";

vi.mock("@/core/storage/db.ts", () => ({
  getSmartFilters: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  updateSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  removeSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getAllArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));
vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

function feed(id: string, title: string): Feed {
  return {
    id,
    url: `https://${id}.com`,
    title,
    description: "",
    siteUrl: "",
    createdAt: 0,
    updatedAt: 0,
  };
}

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: "a",
    feedId: "f1",
    guid: "g",
    title: "T",
    link: "",
    content: "",
    summary: "",
    author: "",
    publishedAt: 0,
    read: false,
    createdAt: 0,
    ...overrides,
  };
}

function renderEditor() {
  return render(
    <MemoryRouter>
      <SmartFilterEditorDialog />
    </MemoryRouter>,
  );
}

describe("SmartFilterEditorDialog", () => {
  beforeEach(() => {
    useSmartFilterStore.setState({
      filters: [],
      isLoading: false,
      editorOpen: false,
      editorTarget: null,
    });
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
    useFeedStore.setState({
      feeds: [feed("f1", "Tech"), feed("f2", "Sports")],
      folders: [],
      selectedFeedId: null,
    });
    useLicenseStore.setState({ tier: "personal", verifying: false });
    vi.clearAllMocks();
  });

  it("does not render when editorOpen is false", () => {
    renderEditor();
    expect(screen.queryByTestId("smart-filter-editor-dialog")).toBeNull();
  });

  it("opens in create mode when openEditor(null) fires", async () => {
    useSmartFilterStore.setState({ editorOpen: true, editorTarget: null });
    renderEditor();

    expect(
      screen.getByTestId("smart-filter-editor-dialog"),
    ).toBeInTheDocument();
    expect(screen.getByText("New smart filter")).toBeInTheDocument();
  });

  it("opens in edit mode pre-filled with the target's fields", () => {
    const target: SmartFilter = {
      id: "x",
      name: "Tech AI",
      rule: emptyRule,
      createdAt: 0,
      updatedAt: 0,
    };
    useSmartFilterStore.setState({
      filters: [target],
      editorOpen: true,
      editorTarget: target,
    });
    renderEditor();

    expect(screen.getByText("Edit filter")).toBeInTheDocument();
    expect(screen.getByTestId("smart-filter-name-input")).toHaveValue("Tech AI");
  });

  it("Save dispatches createFilter for a new filter", async () => {
    const createSpy = vi.fn().mockResolvedValue({
      ok: true,
      value: {
        id: "new",
        name: "x",
        rule: emptyRule,
        createdAt: 0,
        updatedAt: 0,
      },
    });
    useSmartFilterStore.setState({
      editorOpen: true,
      editorTarget: null,
      createFilter: createSpy,
    });
    renderEditor();

    const user = userEvent.setup();
    const nameInput = screen.getByTestId("smart-filter-name-input");
    await user.type(nameInput, "Recent AI");
    await user.click(screen.getByTestId("smart-filter-save"));

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Recent AI", rule: emptyRule }),
    );
  });

  it("Save dispatches updateFilter for an existing filter, preserving id and createdAt", async () => {
    const target: SmartFilter = {
      id: "x",
      name: "Original",
      rule: emptyRule,
      createdAt: 100,
      updatedAt: 100,
    };
    const updateSpy = vi.fn().mockResolvedValue({ ok: true, value: target });
    useSmartFilterStore.setState({
      filters: [target],
      editorOpen: true,
      editorTarget: target,
      updateFilter: updateSpy,
    });
    renderEditor();

    const user = userEvent.setup();
    const input = screen.getByTestId("smart-filter-name-input");
    await user.clear(input);
    await user.type(input, "Renamed");
    await user.click(screen.getByTestId("smart-filter-save"));

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "x",
        name: "Renamed",
        createdAt: 100,
      }),
    );
  });

  it("Cancel closes the dialog without dispatching any action", async () => {
    const createSpy = vi.fn();
    const updateSpy = vi.fn();
    useSmartFilterStore.setState({
      editorOpen: true,
      editorTarget: null,
      createFilter: createSpy,
      updateFilter: updateSpy,
    });
    renderEditor();

    const user = userEvent.setup();
    await user.click(screen.getByText("Cancel"));

    expect(createSpy).not.toHaveBeenCalled();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(useSmartFilterStore.getState().editorOpen).toBe(false);
  });

  it("Save is disabled until the filter has a non-empty name", async () => {
    useSmartFilterStore.setState({ editorOpen: true, editorTarget: null });
    renderEditor();

    expect(screen.getByTestId("smart-filter-save")).toBeDisabled();

    const user = userEvent.setup();
    await user.type(
      screen.getByTestId("smart-filter-name-input"),
      "Anything",
    );
    expect(screen.getByTestId("smart-filter-save")).not.toBeDisabled();
  });

  it("live preview count reflects how many loaded articles match", async () => {
    useArticleStore.setState({
      articlesByFeedId: {
        f1: [
          article({ id: "a1", title: "AI rules" }),
          article({ id: "a2", title: "Sports update" }),
          article({ id: "a3", title: "More AI news" }),
        ],
      },
    });
    useSmartFilterStore.setState({ editorOpen: true, editorTarget: null });
    renderEditor();

    const user = userEvent.setup();
    await user.type(screen.getByTestId("smart-filter-name-input"), "AI");

    // Add a "title contains AI" condition
    const addBtn = screen.getByTestId("add-child-0");
    await user.click(addBtn);
    await user.click(screen.getByText("Condition"));

    const rows = await screen.findAllByTestId("condition-row");
    const titleValueInput = within(rows[0]).getByLabelText("Value");
    await user.type(titleValueInput, "AI");

    const preview = screen.getByTestId("smart-filter-preview-count");
    expect(preview.textContent).toMatch(/^2\b/);
  });

  it("renders condition rows for an existing filter's rule", () => {
    const target: SmartFilter = {
      id: "x",
      name: "T",
      rule: {
        kind: "group",
        match: "all",
        children: [
          { kind: "title", op: "contains", value: "AI" },
          { kind: "read", op: "is", value: false },
        ],
      },
      createdAt: 0,
      updatedAt: 0,
    };
    useSmartFilterStore.setState({
      filters: [target],
      editorOpen: true,
      editorTarget: target,
    });
    renderEditor();

    const rows = screen.getAllByTestId("condition-row");
    expect(rows).toHaveLength(2);
  });
});
