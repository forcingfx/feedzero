/**
 * Quota refusal for OPML / URL-list import.
 *
 * The feed-store already gates addFeed per-URL — but for a 60-URL OPML on a
 * free user at 0 feeds, that means the user gets 50 successes + 10 cryptic
 * "limit exceeded" failures. ImportView pre-checks the total upfront and
 * refuses with a clear error before kicking off the loop.
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
  // Existing tests model the post-launch contract (cap enforced).
  // The pre-launch / inactive case is exercised in the dedicated test
  // at the bottom of the file.
  isPaidTierActive: vi.fn(() => true),
}));

vi.mock("@/core/opml/url-list-parser", async () => {
  const actual = await vi.importActual<typeof import("@/core/opml/url-list-parser")>(
    "@/core/opml/url-list-parser",
  );
  return actual;
});

function seedFreeFeeds(count: number): void {
  const feeds = Array.from({ length: count }, (_, i) => ({
    id: `feed-${i}`,
    url: `https://example.com/${i}.xml`,
    title: `Feed ${i}`,
    description: "",
    lastUpdated: 0,
  }));
  useFeedStore.setState({
    feeds: feeds as never,
    selectedFeedId: null,
    isLoading: false,
    error: null,
  });
}

describe("ImportView quota refusal", () => {
  let addFeedMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    useLicenseStore.setState({ tier: "free", verifying: false });
    seedFreeFeeds(20);
    addFeedMock = vi.fn().mockResolvedValue({ ok: true });
    useFeedStore.setState({ addFeed: addFeedMock } as never);
    // import-store progresses to a "complete" view after a successful import;
    // leaving that state would render the results panel instead of the form
    // on the next test's render. Reset between tests.
    useImportStore.getState().reset();
  });

  it("refuses upfront when URL list would push total past the free-tier cap, without calling addFeed", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);

    // Switch to text-input mode so we can paste a URL list synchronously.
    await user.click(screen.getByLabelText(/paste text/i));

    // 20 already-seeded + 35 pasted = 55, over the 50 cap.
    const thirtyFive = Array.from(
      { length: 35 },
      (_, i) => `https://example.com/import-${i}.xml`,
    ).join("\n");
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(thirtyFive);

    // Quota refusal short-circuits BEFORE the preview screen is shown
    // — surfaces the error inline on the input panel, no preview click.
    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));

    // Tolerant of "exceed", "limit", "50"; what matters is that the user is
    // told why and no addFeed call sneaks through.
    expect(
      await screen.findByText(/limit|exceed|50/i),
    ).toBeInTheDocument();
    expect(addFeedMock).not.toHaveBeenCalled();
  });

  it("imports normally when the count fits within the cap", async () => {
    const user = userEvent.setup();
    seedFreeFeeds(20);
    useFeedStore.setState({ addFeed: addFeedMock } as never);
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const four = Array.from(
      { length: 4 },
      (_, i) => `https://example.com/fits-${i}.xml`,
    ).join("\n");
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(four);

    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));

    // Confirm the preview screen — see ImportPreview, added 2026-05-24.

    await user.click(await screen.findByRole("button", { name: /^import \d+ feeds?$/i }));

    // 20 + 4 = 24, under the 50 cap — addFeed runs for each URL.
    expect(addFeedMock).toHaveBeenCalledTimes(4);
  });

  it("allows large imports for paid users (cap doesn't apply)", async () => {
    const user = userEvent.setup();
    useLicenseStore.setState({ tier: "personal", verifying: false });
    seedFreeFeeds(20);
    useFeedStore.setState({ addFeed: addFeedMock } as never);
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const fifty = Array.from(
      { length: 50 },
      (_, i) => `https://example.com/paid-${i}.xml`,
    ).join("\n");
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(fifty);

    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));

    // Confirm the preview screen — see ImportPreview, added 2026-05-24.

    await user.click(await screen.findByRole("button", { name: /^import \d+ feeds?$/i }));

    expect(addFeedMock).toHaveBeenCalledTimes(50);
  });

  it("allows large free-tier imports when the paid tier is inactive (pre-launch)", async () => {
    const { isPaidTierActive } = await import("@/core/features/paid-tier-active");
    vi.mocked(isPaidTierActive).mockReturnValue(false);

    const user = userEvent.setup();
    useLicenseStore.setState({ tier: "free", verifying: false });
    seedFreeFeeds(20);
    useFeedStore.setState({ addFeed: addFeedMock } as never);
    render(<ImportView onClose={() => {}} />);

    await user.click(screen.getByLabelText(/paste text/i));
    const fifty = Array.from(
      { length: 50 },
      (_, i) => `https://example.com/prelaunch-${i}.xml`,
    ).join("\n");
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(fifty);

    await user.click(screen.getByRole("button", { name: /^import feeds$/i }));

    // Confirm the preview screen — see ImportPreview, added 2026-05-24.

    await user.click(await screen.findByRole("button", { name: /^import \d+ feeds?$/i }));

    // 20 + 50 = 70, well over the 50 cap — but the paid tier hasn't launched,
    // so there's no upgrade path to point users at. Allow the import.
    expect(addFeedMock).toHaveBeenCalledTimes(50);
  });
});
