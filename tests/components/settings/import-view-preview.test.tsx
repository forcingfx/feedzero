/**
 * ImportView — pre-import preview tree.
 *
 * After the user picks a file (or pastes text), and before the
 * mass `addFeed` loop kicks off, we show a folder/feed tree
 * preview with the OPML head metadata and a "Import N feeds"
 * confirmation. The preview is the screenshot the landing page
 * deserves and the safety net users coming from a 200-feed
 * NetNewsWire export deserve too.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
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

const FOLDERED_OPML = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head>
    <title>My subscriptions</title>
    <ownerName>you</ownerName>
    <dateCreated>2026-04-12T10:00:00Z</dateCreated>
  </head>
  <body>
    <outline text="Tech">
      <outline type="rss" text="Tech Weekly" xmlUrl="https://example.com/tech.xml"/>
      <outline type="rss" text="Developer Notes" xmlUrl="https://example.com/dev.xml"/>
    </outline>
    <outline text="News">
      <outline type="rss" text="World Affairs" xmlUrl="https://example.com/news.xml"/>
    </outline>
    <outline type="rss" text="Unfiled blog" xmlUrl="https://example.com/blog.xml"/>
  </body>
</opml>`;

describe("ImportView — preview step", () => {
  beforeEach(() => {
    useLicenseStore.setState({ tier: "personal", verifying: false });
    useFeedStore.setState({
      feeds: [],
      folders: [],
      addFeed: vi.fn().mockResolvedValue({ ok: true }),
      addPlaceholderFeed: vi.fn().mockResolvedValue(undefined),
      createFolder: vi.fn().mockResolvedValue(undefined),
      moveFeedToFolder: vi.fn().mockResolvedValue(undefined),
    } as never);
    useImportStore.getState().reset();
  });

  async function pasteOpml(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByLabelText(/paste text/i));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    await user.click(textarea);
    await user.paste(FOLDERED_OPML);
    await user.click(screen.getByRole("button", { name: /import feeds/i }));
  }

  it("renders the OPML head provenance line in the preview", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    const preview = await screen.findByTestId("import-preview");
    const provenance = within(preview).getByTestId("preview-provenance");
    expect(provenance).toHaveTextContent(/my subscriptions/i);
    expect(provenance).toHaveTextContent(/from you/i);
  });

  it("renders one row per folder with its feed count", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    const preview = await screen.findByTestId("import-preview");
    expect(within(preview).getByTestId("preview-folder-Tech")).toBeInTheDocument();
    expect(within(preview).getByTestId("preview-folder-News")).toBeInTheDocument();
    // Counts: Tech=2, News=1
    expect(
      within(within(preview).getByTestId("preview-folder-Tech")).getByText(/2/),
    ).toBeInTheDocument();
  });

  it("renders unfiled feeds in a separate group", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    const preview = await screen.findByTestId("import-preview");
    expect(within(preview).getByTestId("preview-unfiled")).toBeInTheDocument();
    expect(within(preview).getByText(/Unfiled blog/i)).toBeInTheDocument();
  });

  it("the confirm button is labeled with the total count", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    expect(
      screen.getByRole("button", { name: /import 4 feeds/i }),
    ).toBeInTheDocument();
  });

  it("Back returns to the input view without losing the textarea content", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    await user.click(screen.getByRole("button", { name: /^back$/i }));
    const textarea = screen.getByPlaceholderText(/paste opml/i);
    expect((textarea as HTMLTextAreaElement).value).toContain(
      "My subscriptions",
    );
  });

  it("confirming actually starts the addFeed loop", async () => {
    const user = userEvent.setup();
    render(<ImportView onClose={() => {}} />);
    await pasteOpml(user);
    const addFeed = useFeedStore.getState().addFeed as ReturnType<typeof vi.fn>;
    await user.click(screen.getByRole("button", { name: /import 4 feeds/i }));
    expect(addFeed).toHaveBeenCalled();
  });
});
