import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../src/ui/components/article-list.js";
import { createEventBus } from "../../../src/core/events/event-bus.js";
import { EVENTS } from "../../../src/utils/constants.js";

describe("ArticleList", () => {
  let el;
  let bus;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("article-list");
    bus = createEventBus();
    el.eventBus = bus;
    document.body.appendChild(el);
  });

  it("should render empty state", () => {
    expect(el.shadowRoot.querySelector(".empty").hidden).toBe(false);
  });

  it("should render articles", () => {
    el.setArticles([
      {
        id: "1",
        title: "Post A",
        author: "Alice",
        publishedAt: Date.now(),
        read: false,
      },
      { id: "2", title: "Post B", author: "", publishedAt: null, read: true },
    ]);
    const items = el.shadowRoot.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector(".title").textContent).toBe("Post A");
    expect(items[1].querySelector(".title").classList.contains("read")).toBe(
      true,
    );
  });

  it("should emit article:selected on click", () => {
    const handler = vi.fn();
    bus.on(EVENTS.ARTICLE_SELECTED, handler);

    const article = { id: "a1", title: "Test", read: false };
    el.setArticles([article]);
    el.shadowRoot.querySelector("li").click();

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].article).toEqual(article);
  });

  it("should have proper ARIA attributes", () => {
    const ul = el.shadowRoot.querySelector("ul");
    expect(ul.getAttribute("role")).toBe("listbox");

    el.setArticles([{ id: "1", title: "A", read: false }]);
    const li = el.shadowRoot.querySelector("li");
    expect(li.getAttribute("role")).toBe("option");
    expect(li.getAttribute("tabindex")).toBe("0");
  });
});
