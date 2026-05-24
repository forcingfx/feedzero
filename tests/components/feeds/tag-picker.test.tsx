/**
 * TagPicker — cmdk-backed input that renders tags as pills, suggests
 * existing tags from `feed-store.feeds[].tags` (or an explicit
 * `suggestions` prop), and lets the user add free-form values via
 * Enter or comma. The dialog and the quick-tag modal both mount it,
 * so the keyboard semantics are shared.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TagPicker } from "@/components/feeds/tag-picker.tsx";
import { useFeedStore } from "@/stores/feed-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  getFolders: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));
vi.mock("@/core/sync/sync-service", () => ({
  pushVault: vi.fn(),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

function Harness({
  initial,
  suggestions,
}: {
  initial: string[];
  suggestions?: string[];
}) {
  const [tags, setTags] = useState(initial);
  return (
    <TagPicker
      value={tags}
      onChange={setTags}
      suggestions={suggestions}
      data-testid="picker"
    />
  );
}

describe("TagPicker", () => {
  beforeEach(() => {
    useFeedStore.setState({ feeds: [] } as never);
  });

  it("renders each current tag as a pill", () => {
    render(<Harness initial={["tech", "news"]} />);
    expect(screen.getByTestId("tag-pill-tech")).toBeInTheDocument();
    expect(screen.getByTestId("tag-pill-news")).toBeInTheDocument();
  });

  it("comma in the input commits the typed text as a new tag", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} />);
    const input = screen.getByTestId("picker-input");
    await user.type(input, "tech,");
    expect(screen.getByTestId("tag-pill-tech")).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("backspace on empty input removes the trailing pill", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["tech", "news"]} />);
    const input = screen.getByTestId("picker-input");
    await user.click(input);
    await user.keyboard("{Backspace}");
    expect(screen.queryByTestId("tag-pill-news")).toBeNull();
    expect(screen.getByTestId("tag-pill-tech")).toBeInTheDocument();
  });

  it("clicking a pill's × button removes that pill specifically", async () => {
    const user = userEvent.setup();
    render(<Harness initial={["tech", "news"]} />);
    await user.click(screen.getByLabelText("Remove tech"));
    expect(screen.queryByTestId("tag-pill-tech")).toBeNull();
    expect(screen.getByTestId("tag-pill-news")).toBeInTheDocument();
  });

  it("suggests existing tags that aren't already selected", async () => {
    const user = userEvent.setup();
    render(
      <Harness initial={["tech"]} suggestions={["tech", "news", "frontend"]} />,
    );
    const input = screen.getByTestId("picker-input");
    await user.type(input, "f");
    // "tech" is already selected → not shown. "frontend" matches.
    expect(screen.getByText("frontend")).toBeInTheDocument();
    expect(screen.queryAllByText("tech").length).toBe(1); // only the pill
  });

  it("offers an 'Add new' affordance when the typed text isn't an existing tag", async () => {
    const user = userEvent.setup();
    render(<Harness initial={[]} suggestions={["tech"]} />);
    const input = screen.getByTestId("picker-input");
    await user.type(input, "novel-tag");
    expect(screen.getByTestId("tag-picker-add-new")).toBeInTheDocument();
  });

  it("derives default suggestions from feed-store.feeds[].tags when no prop given", () => {
    useFeedStore.setState({
      feeds: [
        // The empty `description`/`siteUrl` plus the required timestamps
        // satisfy the Feed type without pulling a fixture factory in.
        { id: "f1", url: "https://a.example.com/x", title: "A", description: "", siteUrl: "", createdAt: 0, updatedAt: 0, tags: ["existing-one", "existing-two"] },
        { id: "f2", url: "https://b.example.com/x", title: "B", description: "", siteUrl: "", createdAt: 0, updatedAt: 0, tags: ["existing-two", "existing-three"] },
      ] as never,
    });
    render(<Harness initial={[]} />);
    // All three distinct tags appear as suggestions, alphabetical.
    expect(screen.getByText("existing-one")).toBeInTheDocument();
    expect(screen.getByText("existing-two")).toBeInTheDocument();
    expect(screen.getByText("existing-three")).toBeInTheDocument();
  });
});
