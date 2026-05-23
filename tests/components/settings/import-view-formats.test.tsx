/**
 * ImportView — dispatcher coverage for the shutdown-migration formats:
 * Pocket CSV, Omnivore JSON. The HTML Pocket export + OPML + URL list
 * paths are covered by neighbouring tests (placeholder, folders).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportView } from "@/components/settings/import-view";
import { useFeedStore } from "@/stores/feed-store";
import { useLicenseStore } from "@/stores/license-store";
import { useImportStore } from "@/stores/import-store";

vi.mock("@/core/features/self-hosted", () => ({
  isSelfHosted: vi.fn(() => false),
}));
vi.mock("@/core/features/paid-tier-active", () => ({
  isPaidTierActive: vi.fn(() => true),
}));

describe("ImportView — shutdown-migration formats", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    addFeedMock = vi.fn().mockResolvedValue({ ok: true });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      addFeed: addFeedMock,
      createFolder: vi.fn(),
      moveFeedToFolder: vi.fn(),
    } as never);
    useImportStore.getState().reset();
  });

  it("dispatches a Pocket CSV paste through parsePocketCsvExport", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    const csv = `title,url,time_added,tags,status
"NYT","https://www.nytimes.com/a","1","","unread"
"Guardian","https://www.theguardian.com/x","2","","archive"
"Another NYT","https://www.nytimes.com/b","3","","unread"`;

    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(csv);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    // Two unique origins: nytimes.com (dedup'd) + theguardian.com
    expect(addFeedMock).toHaveBeenCalledTimes(2);
    const urls = addFeedMock.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      "https://www.nytimes.com",
      "https://www.theguardian.com",
    ]);
  });

  it("dispatches an Omnivore JSON paste through parseOmnivoreExport", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    const json = JSON.stringify([
      { url: "https://www.nytimes.com/a", savedAt: "2024-04-01" },
      { url: "https://www.theguardian.com/x", savedAt: "2024-04-02" },
      { url: "https://www.nytimes.com/b", savedAt: "2024-04-03" },
    ]);

    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(json);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));

    expect(addFeedMock).toHaveBeenCalledTimes(2);
    const urls = addFeedMock.mock.calls.map((c) => c[0]).sort();
    expect(urls).toEqual([
      "https://www.nytimes.com",
      "https://www.theguardian.com",
    ]);
  });

  it("mentions the supported migration formats in the dropzone copy", () => {
    render(<ImportView onClose={() => {}} />);
    // Specific shutdowns named in the dropzone so refugees recognise
    // their export's source.
    expect(screen.getByText(/pocket/i)).toBeInTheDocument();
    expect(screen.getByText(/omnivore/i)).toBeInTheDocument();
  });

  it("accepts CSV and JSON file extensions on the file input", () => {
    const { container } = render(<ImportView onClose={() => {}} />);
    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement | null;
    expect(fileInput).not.toBeNull();
    const accept = fileInput?.accept ?? "";
    expect(accept).toContain(".csv");
    expect(accept).toContain(".json");
  });
});
