import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";
import { useFeedStore } from "@/stores/feed-store.ts";
import { toFolderFeedId } from "@/utils/constants.ts";

function Wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={["/feeds"]}>{children}</MemoryRouter>;
}

type NavigateFeedEvent = CustomEvent<{ feedId: string }>;

function captureNavigateFeedEvents() {
  const ids: string[] = [];
  const handler = (e: Event) => {
    ids.push((e as NavigateFeedEvent).detail.feedId);
  };
  document.addEventListener("feedzero:navigate-feed", handler);
  return {
    ids,
    cleanup: () => document.removeEventListener("feedzero:navigate-feed", handler),
  };
}

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

function createListbox(itemCount: number, selectedIndex = -1): HTMLElement {
  const listbox = document.createElement("ul");
  listbox.setAttribute("role", "listbox");

  for (let i = 0; i < itemCount; i++) {
    const item = document.createElement("li");
    item.setAttribute("role", "option");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-selected", i === selectedIndex ? "true" : "false");
    item.textContent = `Item ${i}`;
    listbox.appendChild(item);
  }

  document.body.appendChild(listbox);
  return listbox;
}

function pressKey(key: string, target: EventTarget = document) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(event);
  return event;
}

describe("useKeyboardNav", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  describe("article navigation (j/k)", () => {
    it("j clicks the first item when none is selected", () => {
      const listbox = createListbox(3);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("j");

      expect(clicked).toBe(0);
    });

    it("j clicks the next item after the selected one", () => {
      const listbox = createListbox(3, 0);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("j");

      expect(clicked).toBe(1);
    });

    it("k clicks the previous item before the selected one", () => {
      const listbox = createListbox(3, 2);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("k");

      expect(clicked).toBe(1);
    });

    it("j does not go past the last item", () => {
      const listbox = createListbox(3, 2);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("j");

      expect(clicked).toBe(2);
    });

    it("k does not go before the first item", () => {
      const listbox = createListbox(3, 0);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("k");

      expect(clicked).toBe(0);
    });

    it("k clicks the last item when none is selected", () => {
      const listbox = createListbox(3);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("k");

      expect(clicked).toBe(2);
    });

    it("scrolls selected article into view after j navigation", () => {
      vi.useFakeTimers();
      const listbox = createListbox(5, 0);
      const scrollIntoViewSpy = vi.fn();
      (listbox.children[1] as HTMLElement).scrollIntoView = scrollIntoViewSpy;

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("j");

      // Wait for setTimeout(0)
      vi.runAllTimers();

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });

      vi.useRealTimers();
    });

    it("scrolls selected article into view after k navigation", () => {
      vi.useFakeTimers();
      const listbox = createListbox(5, 2);
      const scrollIntoViewSpy = vi.fn();
      (listbox.children[1] as HTMLElement).scrollIntoView = scrollIntoViewSpy;

      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });
      pressKey("k");

      // Wait for setTimeout(0)
      vi.runAllTimers();

      expect(scrollIntoViewSpy).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });

      vi.useRealTimers();
    });

    it("ArrowDown works as alias for j", () => {
      const listbox = createListbox(3, 0);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("ArrowDown");

      expect(clicked).toBe(1);
    });

    it("ArrowUp works as alias for k", () => {
      const listbox = createListbox(3, 2);
      let clicked = -1;
      Array.from(listbox.children).forEach((item, i) =>
        item.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("ArrowUp");

      expect(clicked).toBe(1);
    });
  });

  it("ignores keys when an input element is focused", () => {
    const listbox = createListbox(3);
    let clicked = false;
    Array.from(listbox.children).forEach((item) =>
      item.addEventListener("click", () => {
        clicked = true;
      }),
    );
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    pressKey("j", input);

    expect(clicked).toBe(false);
  });

  it("ignores keys when a textarea is focused", () => {
    const listbox = createListbox(3);
    let clicked = false;
    Array.from(listbox.children).forEach((item) =>
      item.addEventListener("click", () => {
        clicked = true;
      }),
    );
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    pressKey("j", textarea);

    expect(clicked).toBe(false);
  });

  it("ignores keys when a contenteditable element is focused", () => {
    const listbox = createListbox(3);
    let clicked = false;
    Array.from(listbox.children).forEach((item) =>
      item.addEventListener("click", () => {
        clicked = true;
      }),
    );
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.setAttribute("tabindex", "0");
    document.body.appendChild(editable);
    editable.focus();

    pressKey("j", editable);

    expect(clicked).toBe(false);
  });

  it("does nothing when no listbox exists", () => {
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    // Should not throw
    pressKey("j");
    pressKey("k");
  });

  it("does nothing for unhandled keys", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    const event = pressKey("a");

    expect(event.defaultPrevented).toBe(false);
  });

  it("removes the event listener on unmount", () => {
    const listbox = createListbox(3);
    let clicked = false;
    Array.from(listbox.children).forEach((item) =>
      item.addEventListener("click", () => {
        clicked = true;
      }),
    );
    const { unmount } = renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

    unmount();
    pressKey("j");

    expect(clicked).toBe(false);
  });

  describe("feed navigation (u/i)", () => {
    beforeEach(() => {
      useFeedStore.setState({
        feeds: [],
        folders: [],
        folderOpenState: {},
        selectedFeedId: null,
        feedSortMode: "name",
        feedCustomOrder: [],
        folderCustomOrder: [],
      });
    });

    function seedFeeds(ids: string[]) {
      useFeedStore.setState({
        feeds: ids.map((id) => ({
          id,
          url: `https://${id}.com/feed`,
          title: id,
          description: "",
          siteUrl: `https://${id}.com`,
          createdAt: 0,
          updatedAt: 0,
        })),
      });
    }

    it("u dispatches navigate-feed for the next unfiled feed", () => {
      seedFeeds(["a", "b", "c"]);
      useFeedStore.setState({ selectedFeedId: "a" });
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("u");

      expect(ids).toEqual(["b"]);
      cleanup();
    });

    it("i dispatches navigate-feed for the previous unfiled feed", () => {
      seedFeeds(["a", "b", "c"]);
      useFeedStore.setState({ selectedFeedId: "c" });
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("i");

      expect(ids).toEqual(["b"]);
      cleanup();
    });

    it("u does not advance past the last feed in the logical list", () => {
      seedFeeds(["a", "b", "c"]);
      useFeedStore.setState({ selectedFeedId: "c" });
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("u");

      expect(ids).toEqual(["c"]);
      cleanup();
    });

    it("u selects the first feed when none is active", () => {
      seedFeeds(["a", "b"]);
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("u");

      expect(ids).toEqual(["a"]);
      cleanup();
    });

    it("u traverses into a folder header after the last unfiled feed", () => {
      useFeedStore.setState({
        feeds: [
          { id: "u1", url: "x", title: "u1", description: "", siteUrl: "", createdAt: 0, updatedAt: 0 },
          { id: "f1", url: "y", title: "f1", description: "", siteUrl: "", createdAt: 0, updatedAt: 0, folderId: "fa" },
        ],
        folders: [{ id: "fa", name: "A", createdAt: 0 }],
        folderOpenState: { fa: true },
        selectedFeedId: "u1",
      });
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("u");

      expect(ids).toEqual([toFolderFeedId("fa")]);
      cleanup();
    });

    it("u entering a closed folder also opens that folder", () => {
      useFeedStore.setState({
        feeds: [
          { id: "u1", url: "x", title: "u1", description: "", siteUrl: "", createdAt: 0, updatedAt: 0 },
          { id: "f1", url: "y", title: "f1", description: "", siteUrl: "", createdAt: 0, updatedAt: 0, folderId: "fa" },
        ],
        folders: [{ id: "fa", name: "A", createdAt: 0 }],
        folderOpenState: { fa: false },
        // Already on the folder header, so the next press steps into its child.
        selectedFeedId: toFolderFeedId("fa"),
      });
      const { ids, cleanup } = captureNavigateFeedEvents();
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("u");

      expect(ids).toEqual(["f1"]);
      expect(useFeedStore.getState().folderOpenState.fa).toBe(true);
      cleanup();
    });
  });

  describe("open original (o)", () => {
    it("opens article link in a new tab", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      useArticleStore.setState({
        selectedArticle: {
          id: "a1",
          feedId: "f1",
          guid: "g1",
          title: "Test",
          link: "https://example.com/article",
          content: "",
          summary: "",
          author: "",
          read: false,
          publishedAt: 0,
          createdAt: 0,
        },
      });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("o");

      expect(openSpy).toHaveBeenCalledWith(
        "https://example.com/article",
        "_blank",
        "noopener,noreferrer",
      );
      openSpy.mockRestore();
    });

    it("does nothing when no article is selected", () => {
      const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
      useArticleStore.setState({ selectedArticle: null });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("o");

      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });

  describe("toggle view (h)", () => {
    it("toggles from feed to extracted mode", () => {
      useExtractionStore.setState({ viewMode: "feed" });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("h");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
    });

    it("toggles from extracted back to feed mode", () => {
      useExtractionStore.setState({ viewMode: "extracted" });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("h");

      expect(useExtractionStore.getState().viewMode).toBe("feed");
    });

    it("triggers fetchExtracted when switching to extracted mode with article", () => {
      const fetchExtracted = vi.fn();
      useExtractionStore.setState({
        viewMode: "feed",
        cache: {},
        fetchExtracted,
      });
      useArticleStore.setState({
        selectedArticle: {
          id: "a1",
          feedId: "f1",
          guid: "guid-a1",
          title: "Test Article",
          link: "https://example.com/article",
          content: "<p>Content</p>",
          summary: "",
          author: "",
          publishedAt: Date.now(),
          read: false,
          createdAt: Date.now(),
        },
      });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("h");

      expect(fetchExtracted).toHaveBeenCalledWith(
        "https://example.com/article",
      );
    });

    it("does not fetch if article content is already cached", () => {
      const fetchExtracted = vi.fn();
      useExtractionStore.setState({
        viewMode: "feed",
        cache: { "https://example.com/article": "<p>Cached</p>" },
        fetchExtracted,
      });
      useArticleStore.setState({
        selectedArticle: {
          id: "a1",
          feedId: "f1",
          guid: "guid-a1",
          title: "Test Article",
          link: "https://example.com/article",
          content: "<p>Content</p>",
          summary: "",
          author: "",
          publishedAt: Date.now(),
          read: false,
          createdAt: Date.now(),
        },
      });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("h");

      expect(fetchExtracted).not.toHaveBeenCalled();
    });

    it("does not fetch when no article is selected", () => {
      const fetchExtracted = vi.fn();
      useExtractionStore.setState({
        viewMode: "feed",
        cache: {},
        fetchExtracted,
      });
      useArticleStore.setState({ selectedArticle: null });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("h");

      expect(fetchExtracted).not.toHaveBeenCalled();
    });
  });

  describe("add feed (n)", () => {
    it("dispatches feedzero:navigate-explore custom event", () => {
      let eventFired = false;
      document.addEventListener("feedzero:navigate-explore", () => {
        eventFired = true;
      });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("n");

      expect(eventFired).toBe(true);
    });
  });

  describe("toggle sidebar ([)", () => {
    it("dispatches feedzero:toggle-sidebar custom event", () => {
      let eventFired = false;
      document.addEventListener("feedzero:toggle-sidebar", () => {
        eventFired = true;
      });
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      pressKey("[");

      expect(eventFired).toBe(true);
    });
  });

  describe("refresh feeds (r)", () => {
    it("r key triggers refresh", () => {
      // The hook should add 'r' case to keyboard handler
      // We can't easily test the store call, but we can verify the key is handled
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      const event = pressKey("r");

      // If 'r' is handled, event should be prevented
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe("open settings (Cmd/Ctrl + ,)", () => {
    it("navigates to /settings", async () => {
      // We can't easily inspect the resulting URL from a bare renderHook,
      // so the navigation outcome is exercised end-to-end in
      // tests/components/layout/app-sidebar-layout.test.tsx and via
      // the e2e settings.spec. Here we just assert the key is handled
      // (defaultPrevented) without crashing.
      renderHook(() => useKeyboardNav(), { wrapper: Wrapper });

      const event = new KeyboardEvent("keydown", {
        key: ",",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
    });
  });
});
