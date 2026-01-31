import { EVENTS } from "../../utils/constants.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; padding: var(--space-sm); }
  form { display: flex; gap: var(--space-xs); margin-bottom: var(--space-sm); }
  form input { flex: 1; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: var(--space-xs) var(--space-sm); border-radius: var(--radius); cursor: pointer; }
  li:hover { background: var(--color-bg-hover); }
  li[aria-selected="true"] { background: var(--color-bg-active); font-weight: 600; }
  li:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .empty { color: var(--color-text-secondary); font-size: 0.875rem; padding: var(--space-sm); }
  .error { color: var(--color-danger); font-size: 0.875rem; padding: var(--space-xs); }
  .actions { display: flex; gap: var(--space-xs); margin-bottom: var(--space-sm); }
  .actions button { font-size: 0.75rem; cursor: pointer; }
</style>
<form aria-label="Add feed">
  <label>
    <span class="visually-hidden">Feed URL</span>
    <input type="text" inputmode="url" placeholder="Enter feed URL..." required aria-label="Feed URL">
  </label>
  <button type="submit">Add</button>
</form>
<div class="actions">
  <button class="refresh-all" title="Refresh all feeds">Refresh All</button>
</div>
<div class="error" role="alert" hidden></div>
<ul role="listbox" aria-label="Feeds"></ul>
<div class="empty">No feeds yet. Add one above.</div>
`;

export class FeedList extends HTMLElement {
  #bus = null;
  #feeds = [];
  #selectedId = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  set eventBus(bus) {
    this.#bus = bus;
  }

  connectedCallback() {
    this.shadowRoot.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = this.shadowRoot.querySelector("input");
      const url = input.value.trim();
      if (!url) return;
      // Block dangerous URL schemes (javascript:, data:, file:, etc.)
      if (
        url.includes(":") &&
        !url.startsWith("http://") &&
        !url.startsWith("https://")
      ) {
        this.showError("Only http and https URLs are supported.");
        return;
      }
      if (this.#bus) {
        this.#bus.emit(EVENTS.FEED_ADDED, { url });
        input.value = "";
        this.hideError();
      }
    });

    this.shadowRoot
      .querySelector(".refresh-all")
      .addEventListener("click", () => {
        if (this.#bus) this.#bus.emit(EVENTS.REFRESH_ALL);
      });

    this.shadowRoot.querySelector("ul").addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li && this.#bus) {
        this.selectFeed(li.dataset.id);
      }
    });

    this.shadowRoot.querySelector("ul").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const li = e.target.closest("li");
        if (li && this.#bus) {
          e.preventDefault();
          this.selectFeed(li.dataset.id);
        }
      }
    });
  }

  selectFeed(id) {
    this.#selectedId = id;
    this.render();
    if (this.#bus) {
      this.#bus.emit(EVENTS.FEED_SELECTED, { feedId: id });
    }
  }

  showError(message) {
    const el = this.shadowRoot.querySelector(".error");
    el.textContent = message;
    el.hidden = false;
  }

  hideError() {
    const el = this.shadowRoot.querySelector(".error");
    el.textContent = "";
    el.hidden = true;
  }

  setFeeds(feeds) {
    this.#feeds = feeds;
    this.render();
  }

  render() {
    const ul = this.shadowRoot.querySelector("ul");
    const empty = this.shadowRoot.querySelector(".empty");

    ul.innerHTML = "";
    empty.hidden = this.#feeds.length > 0;

    for (const feed of this.#feeds) {
      const li = document.createElement("li");
      li.textContent = feed.title;
      li.dataset.id = feed.id;
      li.setAttribute("role", "option");
      li.setAttribute("tabindex", "0");
      li.setAttribute(
        "aria-selected",
        feed.id === this.#selectedId ? "true" : "false",
      );
      ul.appendChild(li);
    }
  }
}

customElements.define("feed-list", FeedList);
