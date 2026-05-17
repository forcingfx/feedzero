/**
 * <ExportView> — URL list textarea mobile-overflow guard (Tier 2 structural).
 *
 * Regression: long feed URLs in the readonly textarea overflowed the
 * viewport on mobile because the textarea had `w-full` but its ancestors
 * lacked `min-w-0` and the textarea had no `max-w-full` / `break-all`.
 *
 * Fix: wrapper has `min-w-0`; textarea has `min-w-0 max-w-full break-all`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render } from "@testing-library/react";
import { ExportView } from "@/components/settings/export-view";
import { useFeedStore } from "@/stores/feed-store";

vi.mock("@/core/opml/opml-service", () => ({
  generateOpmlFile: vi.fn().mockReturnValue("<opml/>"),
  generateUrlList: vi
    .fn()
    .mockReturnValue(
      "https://feeds.example.com/some/very/long/path/to/a/feed.xml?queryparam=value",
    ),
}));

describe("<ExportView> — mobile width guard", () => {
  beforeEach(() => {
    useFeedStore.setState({
      feeds: [
        {
          id: "f1",
          url: "https://feeds.example.com/some/very/long/path/to/a/feed.xml?queryparam=value",
          title: "Long",
          // Minimum extra fields exercised by ExportView — feed-store schema
          // tolerates partial seeds for component-level rendering tests.
        } as never,
      ],
      folders: [],
    });
  });

  it("textarea wrapper has min-w-0 so long URLs do not push past the viewport", () => {
    const { container } = render(<ExportView />);
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    const wrapper = textarea!.parentElement!;
    expect(wrapper.className).toContain("min-w-0");
  });

  it("textarea itself has max-w-full and min-w-0 so flex/grid ancestors cannot stretch it", () => {
    const { container } = render(<ExportView />);
    const textarea = container.querySelector("textarea")!;
    expect(textarea.className).toContain("max-w-full");
    expect(textarea.className).toContain("min-w-0");
    expect(textarea.className).toContain("break-all");
  });
});
