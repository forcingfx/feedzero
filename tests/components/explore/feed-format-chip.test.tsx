import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FeedFormatChip } from "@/components/explore/feed-format-chip";
import * as feedService from "@/core/feeds/feed-service";

/**
 * The chip sits under the Explore URL input and *celebrates the
 * discovery* that the brief implied but the UI never delivered: which
 * of RSS / Atom / JSON Feed actually parsed. Three states matter and
 * the screenshots will rely on each:
 *
 *  - probing       — animated dot while previewFeed() is in flight
 *  - found <fmt>   — solid pill on the matched format, faint pills on others
 *  - not-found     — terse "No feed at that URL yet" affordance
 *
 * Real timers throughout — the debounce is 400ms and fake timers
 * deadlock against the async previewFeed Promise in happy-dom.
 */
describe("FeedFormatChip", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders nothing when url is empty", () => {
    const { container } = render(<FeedFormatChip url="" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders three format pills when probing", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockImplementation(
      () => new Promise(() => {}),
    );
    render(<FeedFormatChip url="https://example.com/feed.xml" />);
    await waitFor(() =>
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-state",
        "probing",
      ),
    );
    expect(screen.getByTestId("format-pill-rss")).toBeInTheDocument();
    expect(screen.getByTestId("format-pill-atom")).toBeInTheDocument();
    expect(screen.getByTestId("format-pill-json")).toBeInTheDocument();
  });

  it("highlights the matched format when a feed is found", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockResolvedValue({
      ok: true,
      value: { title: "Atom Site", siteUrl: "", format: "atom", articles: [] },
    });
    render(<FeedFormatChip url="https://example.com/feed.xml" />);
    await waitFor(() => {
      const chip = screen.getByTestId("feed-format-chip");
      expect(chip).toHaveAttribute("data-state", "found");
      expect(chip).toHaveAttribute("data-format", "atom");
    });
    expect(screen.getByTestId("format-pill-atom")).toHaveAttribute(
      "data-active",
      "true",
    );
    expect(screen.getByTestId("format-pill-rss")).toHaveAttribute(
      "data-active",
      "false",
    );
  });

  it("celebrates the discovery with the format name and feed title", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockResolvedValue({
      ok: true,
      value: {
        title: "Example Blog",
        siteUrl: "",
        format: "atom",
        articles: [],
      },
    });
    render(<FeedFormatChip url="https://example.com/feed.xml" />);
    const chip = await screen.findByTestId("feed-format-chip");
    await waitFor(() =>
      expect(chip).toHaveAttribute("data-state", "found"),
    );
    expect(chip).toHaveTextContent(/atom feed found/i);
    expect(chip).toHaveTextContent(/Example Blog/);
  });

  it("renders a clickable 'Add feed' button when a feed is found", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockResolvedValue({
      ok: true,
      value: { title: "Atom Site", siteUrl: "", format: "atom", articles: [] },
    });
    const onAdd = vi.fn();
    render(
      <FeedFormatChip url="https://example.com/feed.xml" onAdd={onAdd} />,
    );
    const addBtn = await screen.findByRole("button", { name: /add feed/i });
    await userEvent.setup().click(addBtn);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("still offers a 'Try anyway' Add button in the not-found state", async () => {
    // When our probe says no feed was found, Enter can still work
    // because addFeed runs its own full discovery cascade. Keeping
    // the Add affordance visible (just muted) means the user always
    // has a path forward instead of being told "give up".
    vi.spyOn(feedService, "previewWithDiscovery").mockResolvedValue({
      ok: false,
      error: "nope",
    });
    const onAdd = vi.fn();
    render(
      <FeedFormatChip url="https://example.com/feed.xml" onAdd={onAdd} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-state",
        "not-found",
      ),
    );
    const tryAnyway = screen.getByRole("button", { name: /try anyway/i });
    expect(tryAnyway).toBeInTheDocument();
    await userEvent.setup().click(tryAnyway);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("renders no Add button while probing", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockImplementation(
      () => new Promise(() => {}),
    );
    render(
      <FeedFormatChip url="https://example.com/feed.xml" onAdd={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-state",
        "probing",
      ),
    );
    expect(
      screen.queryByRole("button", { name: /add feed|try anyway/i }),
    ).not.toBeInTheDocument();
  });

  it("falls back to a 'no feed yet' state on failure", async () => {
    vi.spyOn(feedService, "previewWithDiscovery").mockResolvedValue({
      ok: false,
      error: "nope",
    });
    render(<FeedFormatChip url="https://example.com/feed.xml" />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-state",
        "not-found",
      );
    });
  });

  it("ignores stale probe results when the URL changes mid-flight", async () => {
    // Make the first probe block forever and the second resolve fast.
    // If the generation guard is broken, the first probe will eventually
    // resolve and overwrite the second's chip — we'd see "rss" or no
    // attribute at all. Generation-correct: we see "json".
    let resolveFirst: (v: unknown) => void = () => {};
    const firstPromise = new Promise((r) => {
      resolveFirst = r;
    });
    vi.spyOn(feedService, "previewWithDiscovery")
      .mockImplementationOnce(() => firstPromise as never)
      .mockResolvedValueOnce({
        ok: true,
        value: {
          title: "JSON Site",
          siteUrl: "",
          format: "json",
          articles: [],
        },
      });
    const { rerender } = render(
      <FeedFormatChip url="https://example.com/feed.xml" />,
    );
    // Wait until the first probe is in-flight ("probing" state).
    await waitFor(() =>
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-state",
        "probing",
      ),
    );
    rerender(<FeedFormatChip url="https://other.example/feed.json" />);
    await waitFor(() => {
      expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
        "data-format",
        "json",
      );
    });
    // Now resolve the stale first probe — the chip must NOT regress.
    resolveFirst({
      ok: true,
      value: { title: "RSS Site", siteUrl: "", format: "rss", articles: [] },
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByTestId("feed-format-chip")).toHaveAttribute(
      "data-format",
      "json",
    );
  });
});
