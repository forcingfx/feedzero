import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav.ts";
import { useArticleStore } from "@/stores/article-store.ts";
import { useExtractionStore } from "@/stores/extraction-store.ts";

vi.mock("@/core/storage/db.ts", () => ({
  getArticles: vi.fn().mockResolvedValue({ ok: true, value: [] }),
  updateArticle: vi.fn().mockResolvedValue({ ok: true, value: true }),
  getFeeds: vi.fn().mockResolvedValue({ ok: true, value: [] }),
}));

vi.mock("@/core/extractor/extractor.ts", () => ({
  extract: vi.fn(),
}));

function createSidebarButtons(count: number, activeIndex = -1): HTMLElement[] {
  const buttons: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.setAttribute("data-sidebar", "menu-button");
    btn.setAttribute("data-active", i === activeIndex ? "true" : "false");
    btn.textContent = `Feed ${i}`;
    document.body.appendChild(btn);
    buttons.push(btn);
  }
  return buttons;
}

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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

      pressKey("k");

      expect(clicked).toBe(2);
    });

    it("scrolls selected article into view after j navigation", () => {
      vi.useFakeTimers();
      const listbox = createListbox(5, 0);
      const scrollIntoViewSpy = vi.fn();
      (listbox.children[1] as HTMLElement).scrollIntoView = scrollIntoViewSpy;

      renderHook(() => useKeyboardNav());
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

      renderHook(() => useKeyboardNav());
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
  });

  it("ignores keys when an input element is focused", () => {
    const listbox = createListbox(3);
    let clicked = false;
    Array.from(listbox.children).forEach((item) =>
      item.addEventListener("click", () => {
        clicked = true;
      }),
    );
    renderHook(() => useKeyboardNav());

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
    renderHook(() => useKeyboardNav());

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
    renderHook(() => useKeyboardNav());

    const editable = document.createElement("div");
    editable.contentEditable = "true";
    editable.setAttribute("tabindex", "0");
    document.body.appendChild(editable);
    editable.focus();

    pressKey("j", editable);

    expect(clicked).toBe(false);
  });

  it("does nothing when no listbox exists", () => {
    renderHook(() => useKeyboardNav());

    // Should not throw
    pressKey("j");
    pressKey("k");
  });

  it("does nothing for unhandled keys", () => {
    createListbox(3);
    renderHook(() => useKeyboardNav());

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
    const { unmount } = renderHook(() => useKeyboardNav());

    unmount();
    pressKey("j");

    expect(clicked).toBe(false);
  });

  describe("feed navigation (u/i)", () => {
    it("u clicks the next feed button", () => {
      const buttons = createSidebarButtons(3, 0);
      let clicked = -1;
      buttons.forEach((btn, i) =>
        btn.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav());

      pressKey("u");

      expect(clicked).toBe(1);
    });

    it("i clicks the previous feed button", () => {
      const buttons = createSidebarButtons(3, 2);
      let clicked = -1;
      buttons.forEach((btn, i) =>
        btn.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav());

      pressKey("i");

      expect(clicked).toBe(1);
    });

    it("u does not go past the last feed", () => {
      const buttons = createSidebarButtons(3, 2);
      let clicked = -1;
      buttons.forEach((btn, i) =>
        btn.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav());

      pressKey("u");

      expect(clicked).toBe(2);
    });

    it("i does not go before the first feed", () => {
      const buttons = createSidebarButtons(3, 0);
      let clicked = -1;
      buttons.forEach((btn, i) =>
        btn.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav());

      pressKey("i");

      expect(clicked).toBe(0);
    });

    it("u selects first feed when none is active", () => {
      const buttons = createSidebarButtons(3);
      let clicked = -1;
      buttons.forEach((btn, i) =>
        btn.addEventListener("click", () => {
          clicked = i;
        }),
      );
      renderHook(() => useKeyboardNav());

      pressKey("u");

      expect(clicked).toBe(0);
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
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

      pressKey("o");

      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });

  describe("toggle view (e)", () => {
    it("toggles from feed to extracted mode", () => {
      useExtractionStore.setState({ viewMode: "feed" });
      renderHook(() => useKeyboardNav());

      pressKey("e");

      expect(useExtractionStore.getState().viewMode).toBe("extracted");
    });

    it("toggles from extracted back to feed mode", () => {
      useExtractionStore.setState({ viewMode: "extracted" });
      renderHook(() => useKeyboardNav());

      pressKey("e");

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
      renderHook(() => useKeyboardNav());

      pressKey("e");

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
      renderHook(() => useKeyboardNav());

      pressKey("e");

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
      renderHook(() => useKeyboardNav());

      pressKey("e");

      expect(fetchExtracted).not.toHaveBeenCalled();
    });
  });

  describe("add feed (n)", () => {
    it("dispatches feedzero:add-feed custom event", () => {
      let eventFired = false;
      document.addEventListener("feedzero:add-feed", () => {
        eventFired = true;
      });
      renderHook(() => useKeyboardNav());

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
      renderHook(() => useKeyboardNav());

      pressKey("[");

      expect(eventFired).toBe(true);
    });
  });

  describe("refresh feeds (r)", () => {
    it("r key triggers refresh", () => {
      // The hook should add 'r' case to keyboard handler
      // We can't easily test the store call, but we can verify the key is handled
      renderHook(() => useKeyboardNav());

      const event = pressKey("r");

      // If 'r' is handled, event should be prevented
      expect(event.defaultPrevented).toBe(true);
    });
  });
});
