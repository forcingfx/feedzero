import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AutoOrganizeDialog } from "@/components/folders/auto-organize-dialog";
import { useFeedStore } from "@/stores/feed-store";
import { useArticleStore } from "@/stores/article-store";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn(),
  getFeed: vi.fn(),
  updateFeed: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  addFolder: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("@/stores/sync-store", () => ({
  useSyncStore: {
    getState: () => ({ scheduleSyncPush: vi.fn() }),
  },
}));

function makeFeed(id: string, title: string, description = "") {
  return {
    id,
    url: `https://example.com/${id}.xml`,
    title,
    description,
    siteUrl: `https://example.com/${id}`,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("AutoOrganizeDialog", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [
        makeFeed("f1", "Hacker News", "tech and software"),
        makeFeed("f2", "Bloomberg", "business finance markets"),
        makeFeed("f3", "My Personal Blog", "random thoughts"),
      ],
      folders: [],
    });
    useArticleStore.setState({ articlesByFeedId: {}, articles: [] });
  });

  it("renders a row per topic with the count of matched feeds", () => {
    render(<AutoOrganizeDialog open={true} onOpenChange={vi.fn()} />);

    const techRow = screen.getByTestId("topic-row-tech");
    expect(within(techRow).getByDisplayValue("Tech")).toBeInTheDocument();
    expect(within(techRow).getByText(/^1$/)).toBeInTheDocument();

    const bizRow = screen.getByTestId("topic-row-business");
    expect(within(bizRow).getByDisplayValue("Business")).toBeInTheDocument();
    expect(within(bizRow).getByText(/^1$/)).toBeInTheDocument();
  });

  it("renders an Uncategorized row counting feeds that didn't match", () => {
    render(<AutoOrganizeDialog open={true} onOpenChange={vi.fn()} />);

    const uncatRow = screen.getByTestId("topic-row-uncategorized");
    expect(within(uncatRow).getByText(/Uncategorized/)).toBeInTheDocument();
    // f3 (My Personal Blog) doesn't match any topic.
    expect(within(uncatRow).getByText(/^1$/)).toBeInTheDocument();
  });

  it("removes a topic and the row disappears from the dialog", async () => {
    const user = userEvent.setup();
    render(<AutoOrganizeDialog open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByTestId("topic-row-tech")).toBeInTheDocument();
    const techRow = screen.getByTestId("topic-row-tech");
    await user.click(within(techRow).getByRole("button", { name: /remove/i }));

    expect(screen.queryByTestId("topic-row-tech")).toBeNull();
    // The uncategorized row still exists (rematch happens against remaining topics).
    expect(screen.getByTestId("topic-row-uncategorized")).toBeInTheDocument();
  });

  it("clicking Apply calls applyAutoOrganize with non-empty topics and closes the dialog", async () => {
    const user = userEvent.setup();
    const apply = vi.fn().mockResolvedValue(undefined);
    useFeedStore.setState({ applyAutoOrganize: apply });
    const onOpenChange = vi.fn();

    render(<AutoOrganizeDialog open={true} onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: /apply/i }));

    expect(apply).toHaveBeenCalledTimes(1);
    const plan = apply.mock.calls[0][0];
    // Tech and Business have one feed each — Uncategorized must NOT be in the plan.
    const folderNames = plan.map((p: { folderName: string }) => p.folderName);
    expect(folderNames).toContain("Tech");
    expect(folderNames).toContain("Business");
    expect(folderNames).not.toContain("Uncategorized");

    await vi.waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("Apply is disabled when no topic has matched feeds", async () => {
    useFeedStore.setState({
      feeds: [makeFeed("f1", "My Diary", "random thoughts")],
      folders: [],
    });

    render(<AutoOrganizeDialog open={true} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: /apply/i }),
    ).toBeDisabled();
  });
});
