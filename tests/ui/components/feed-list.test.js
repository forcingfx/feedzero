import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../../src/ui/components/feed-list.js";
import { createEventBus } from "../../../src/core/events/event-bus.js";
import { EVENTS } from "../../../src/utils/constants.js";

describe("FeedList", () => {
  let el;
  let bus;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("feed-list");
    bus = createEventBus();
    el.eventBus = bus;
    document.body.appendChild(el);
  });

  it("should render empty state", () => {
    const empty = el.shadowRoot.querySelector(".empty");
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain("No feeds");
  });

  it("should render feeds", () => {
    el.setFeeds([
      { id: "1", title: "Feed A" },
      { id: "2", title: "Feed B" },
    ]);
    const items = el.shadowRoot.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe("Feed A");
    expect(items[1].textContent).toBe("Feed B");
    expect(el.shadowRoot.querySelector(".empty").hidden).toBe(true);
  });

  it("should emit feed:added on form submit", () => {
    const handler = vi.fn();
    bus.on(EVENTS.FEED_ADDED, handler);

    const input = el.shadowRoot.querySelector("input");
    input.value = "https://example.com/rss";
    el.shadowRoot
      .querySelector("form")
      .dispatchEvent(new Event("submit", { cancelable: true }));

    expect(handler).toHaveBeenCalledWith(
      { url: "https://example.com/rss" },
      EVENTS.FEED_ADDED,
    );
  });

  it("should emit feed:selected on click", () => {
    const handler = vi.fn();
    bus.on(EVENTS.FEED_SELECTED, handler);

    el.setFeeds([{ id: "f1", title: "Test" }]);
    el.shadowRoot.querySelector("li").click();

    expect(handler).toHaveBeenCalledWith(
      { feedId: "f1" },
      EVENTS.FEED_SELECTED,
    );
  });

  it("should mark selected feed with aria-selected", () => {
    el.setFeeds([
      { id: "1", title: "A" },
      { id: "2", title: "B" },
    ]);
    el.selectFeed("2");
    const items = el.shadowRoot.querySelectorAll("li");
    expect(items[0].getAttribute("aria-selected")).toBe("false");
    expect(items[1].getAttribute("aria-selected")).toBe("true");
  });

  it("should show and hide errors", () => {
    el.showError("Something went wrong");
    const err = el.shadowRoot.querySelector(".error");
    expect(err.hidden).toBe(false);
    expect(err.textContent).toBe("Something went wrong");

    el.hideError();
    expect(err.hidden).toBe(true);
  });

  it("should have proper ARIA attributes", () => {
    const ul = el.shadowRoot.querySelector("ul");
    expect(ul.getAttribute("role")).toBe("listbox");
    expect(ul.getAttribute("aria-label")).toBe("Feeds");

    el.setFeeds([{ id: "1", title: "A" }]);
    const li = el.shadowRoot.querySelector("li");
    expect(li.getAttribute("role")).toBe("option");
    expect(li.getAttribute("tabindex")).toBe("0");
  });
});
