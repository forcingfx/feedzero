import { EVENTS } from "../../utils/constants.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; padding: var(--space-sm); }
  ul { list-style: none; padding: 0; margin: 0; }
  li { padding: var(--space-sm); border-bottom: 1px solid var(--color-border); cursor: pointer; }
  li:hover { background: var(--color-bg-hover); }
  li[aria-selected="true"] { background: var(--color-bg-active); }
  li:focus-visible { outline: 2px solid var(--color-accent); outline-offset: -2px; }
  .title { font-weight: 500; }
  .title.read { font-weight: 400; color: var(--color-text-secondary); }
  .meta { font-size: 0.75rem; color: var(--color-text-secondary); margin-top: var(--space-xs); }
  .empty { color: var(--color-text-secondary); font-size: 0.875rem; padding: var(--space-sm); }
  .header { display: flex; justify-content: flex-end; padding: var(--space-xs) var(--space-sm); }
  .header button { font-size: 0.75rem; cursor: pointer; }
  .header[hidden] { display: none; }
</style>
<div class="header" hidden>
  <button class="refresh-feed" title="Refresh this feed">Refresh</button>
</div>
<ul role="listbox" aria-label="Articles"></ul>
<div class="empty">Select a feed to view articles.</div>
`;

export class ArticleList extends HTMLElement {
  #bus = null;
  #articles = [];
  #selectedId = null;
  #feedId = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  set eventBus(bus) {
    this.#bus = bus;
  }

  connectedCallback() {
    this.shadowRoot
      .querySelector(".refresh-feed")
      .addEventListener("click", () => {
        if (this.#bus && this.#feedId) {
          this.#bus.emit(EVENTS.REFRESH_FEED, { feedId: this.#feedId });
        }
      });

    this.shadowRoot.querySelector("ul").addEventListener("click", (e) => {
      const li = e.target.closest("li");
      if (li) this.selectArticle(li.dataset.id);
    });

    this.shadowRoot.querySelector("ul").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const li = e.target.closest("li");
        if (li) {
          e.preventDefault();
          this.selectArticle(li.dataset.id);
        }
      }
    });
  }

  selectArticle(id) {
    this.#selectedId = id;
    this.render();
    const article = this.#articles.find((a) => a.id === id);
    if (article && this.#bus) {
      this.#bus.emit(EVENTS.ARTICLE_SELECTED, { article });
    }
  }

  setArticles(articles, feedId = null) {
    this.#articles = articles;
    this.#selectedId = null;
    this.#feedId = feedId;
    this.shadowRoot.querySelector(".header").hidden = !feedId;
    this.render();
  }

  render() {
    const ul = this.shadowRoot.querySelector("ul");
    const empty = this.shadowRoot.querySelector(".empty");

    ul.innerHTML = "";
    empty.hidden = this.#articles.length > 0;

    for (const article of this.#articles) {
      const li = document.createElement("li");
      li.dataset.id = article.id;
      li.setAttribute("role", "option");
      li.setAttribute("tabindex", "0");
      li.setAttribute(
        "aria-selected",
        article.id === this.#selectedId ? "true" : "false",
      );

      const title = document.createElement("div");
      title.className = `title${article.read ? " read" : ""}`;
      title.textContent = article.title;

      const meta = document.createElement("div");
      meta.className = "meta";
      const parts = [];
      if (article.author) parts.push(article.author);
      if (article.publishedAt)
        parts.push(new Date(article.publishedAt).toLocaleDateString());
      meta.textContent = parts.join(" \u2022 ");

      li.appendChild(title);
      li.appendChild(meta);
      ul.appendChild(li);
    }
  }
}

customElements.define("article-list", ArticleList);
