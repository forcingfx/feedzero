/**
 * ExportView — passes folder data to generateOpmlFile (PR E round-trip).
 *
 * Contract test: verifies the wire-up. The generateOpmlFile contract for
 * grouping by folders is exercised in opml-service.test.ts.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExportView } from "@/components/settings/export-view";
import { useFeedStore } from "@/stores/feed-store";

const generateOpmlMock = vi.fn().mockReturnValue("<opml/>");
vi.mock("@/core/opml/opml-service", () => ({
  generateOpmlFile: (...args: unknown[]) =>
    generateOpmlMock(...(args as Parameters<typeof generateOpmlMock>)),
  generateUrlList: vi.fn().mockReturnValue(""),
}));

describe("<ExportView> — folder wire-up", () => {
  beforeEach(() => {
    generateOpmlMock.mockClear();
    // Stub URL.createObjectURL / revokeObjectURL for the download flow.
    Object.defineProperty(globalThis.URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:fake"),
    });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("passes BOTH feeds AND folders to generateOpmlFile on download", async () => {
    const now = Date.now();
    const folders = [{ id: "fld-tech", name: "Tech", createdAt: now }];
    const feeds = [
      {
        id: "f1",
        url: "https://example.com/a.xml",
        title: "A",
        description: "",
        siteUrl: "",
        folderId: "fld-tech",
        createdAt: now,
        updatedAt: now,
      },
    ];
    useFeedStore.setState({ feeds, folders } as never);

    const user = userEvent.setup();
    render(<ExportView />);
    await user.click(screen.getByRole("button", { name: /download opml/i }));

    expect(generateOpmlMock).toHaveBeenCalledWith(feeds, folders);
  });
});
