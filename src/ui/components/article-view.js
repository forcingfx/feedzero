import { extract } from "../../core/extractor/extractor.js";

const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; padding: var(--space-md) var(--space-lg); overflow-y: auto; }
  .empty { color: var(--color-text-secondary); }
  h2 { font-size: 1.5rem; margin-bottom: var(--space-xs); }
  .meta { font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: var(--space-xs); }
  .meta a { color: var(--color-accent); }
  .view-toggle { display: flex; gap: var(--space-xs); margin-bottom: var(--space-md); }
  .view-toggle button {
    font-size: 0.75rem;
    padding: 2px 8px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-text-secondary);
    cursor: pointer;
  }
  .view-toggle button[aria-pressed="true"] {
    background: var(--color-bg-active);
    color: var(--color-text);
    font-weight: 600;
  }
  .view-toggle button:hover { background: var(--color-bg-hover); }
  .content { line-height: 1.7; max-width: 720px; }
  .content img { max-width: 100%; height: auto; }
  .content pre { overflow-x: auto; background: var(--color-bg-secondary); padding: var(--space-sm); border-radius: var(--radius); }
  .content blockquote { border-left: 3px solid var(--color-border); padding-left: var(--space-md); color: var(--color-text-secondary); }
  .extracting { color: var(--color-text-secondary); font-style: italic; }
</style>
<article>
  <div class="empty">Select an article to read.</div>
</article>
`;

export class ArticleView extends HTMLElement {
  #article = null;
  #viewMode = "feed"; // "feed" | "extracted" | "summary"
  #extractedCache = new Map(); // link → extracted HTML

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  setArticle(article) {
    this.#article = article;
    this.#viewMode = "feed";
    this.#render();
  }

  #stripHtml(html) {
    const div = document.createElement("div");
    div.innerHTML = html || "";
    return (div.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  #contentsSimilar(a, b) {
    const textA = this.#stripHtml(a);
    const textB = this.#stripHtml(b);
    if (!textA || !textB) return false;
    const snippetA = textA.slice(0, 200);
    const snippetB = textB.slice(0, 200);
    return snippetA.startsWith(snippetB) || snippetB.startsWith(snippetA);
  }

  #getAvailableModes() {
    const article = this.#article;
    if (!article) return ["feed"];

    const modes = ["feed"];
    const feedContent = article.content || article.summary || "";

    // Add summary only if it exists and differs from feed content
    if (
      article.summary &&
      !this.#contentsSimilar(feedContent, article.summary)
    ) {
      modes.push("summary");
    }

    // Add extracted — only if there's a valid link to extract from
    if (article.link && article.link.startsWith("http")) {
      if (this.#extractedCache.has(article.link)) {
        const extracted = this.#extractedCache.get(article.link);
        if (!this.#contentsSimilar(feedContent, extracted)) {
          modes.push("extracted");
        }
      } else {
        modes.push("extracted");
      }
    }

    return modes;
  }

  #render() {
    const container = this.shadowRoot.querySelector("article");
    const article = this.#article;

    if (!article) {
      container.innerHTML =
        '<div class="empty">Select an article to read.</div>';
      return;
    }

    const meta = [];
    if (article.author) meta.push(article.author);
    if (article.publishedAt) {
      meta.push(
        new Date(article.publishedAt).toLocaleString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    }

    const availableModes = this.#getAvailableModes();
    // If current mode is no longer available, fall back to feed
    if (!availableModes.includes(this.#viewMode)) {
      this.#viewMode = "feed";
    }

    const content = this.#getContent();

    const toggleHtml =
      availableModes.length > 1
        ? `<div class="view-toggle">
          ${availableModes.map((mode) => `<button data-mode="${mode}" aria-pressed="${this.#viewMode === mode}">${mode.charAt(0).toUpperCase() + mode.slice(1)}</button>`).join("")}
        </div>`
        : "";

    container.innerHTML = `
      <h2>${this.#escapeHtml(article.title)}</h2>
      <div class="meta">
        ${meta.map((m) => this.#escapeHtml(m)).join(" &bull; ")}
        ${article.link ? ` &mdash; <a href="${this.#escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">Original</a>` : ""}
      </div>
      ${toggleHtml}
      <div class="content">${content}</div>
    `;

    // Wire toggle buttons
    for (const btn of container.querySelectorAll(".view-toggle button")) {
      btn.addEventListener("click", (e) => {
        const mode = e.target.dataset.mode;
        if (mode === "extracted" && !this.#extractedCache.has(article.link)) {
          this.#fetchExtracted(article);
        } else {
          this.#viewMode = mode;
          this.#render();
        }
      });
    }
  }

  #getContent() {
    const article = this.#article;
    if (this.#viewMode === "summary") {
      return article.summary || "<p>No summary available.</p>";
    }
    if (this.#viewMode === "extracted") {
      const cached = this.#extractedCache.get(article.link);
      if (cached) return cached;
      return "<p>No extracted content available.</p>";
    }
    // "feed" mode — default
    return article.content || article.summary || "<p>No content available.</p>";
  }

  async #fetchExtracted(article) {
    if (!article.link || !article.link.startsWith("http")) {
      this.#extractedCache.set(
        article.link,
        "<p>Cannot extract: no valid URL.</p>",
      );
      this.#viewMode = "extracted";
      this.#render();
      return;
    }

    // Show loading state
    this.#viewMode = "extracted";
    const contentDiv = this.shadowRoot.querySelector(".content");
    if (contentDiv)
      contentDiv.innerHTML =
        '<p class="extracting">Extracting full text...</p>';

    // Update toggle state
    for (const btn of this.shadowRoot.querySelectorAll(".view-toggle button")) {
      btn.setAttribute("aria-pressed", btn.dataset.mode === "extracted");
    }

    try {
      const pageUrl = `/api/page?url=${encodeURIComponent(article.link)}`;
      const response = await fetch(pageUrl);
      if (!response.ok) {
        this.#extractedCache.set(
          article.link,
          "<p>Failed to fetch the article page.</p>",
        );
        this.#render();
        return;
      }

      const contentType = (
        response.headers.get("content-type") || ""
      ).toLowerCase();
      if (
        !contentType.includes("text/html") &&
        !contentType.includes("text/xhtml")
      ) {
        this.#extractedCache.set(
          article.link,
          "<p>This link points to a non-HTML resource and cannot be extracted.</p>",
        );
        this.#render();
        return;
      }

      const html = await response.text();
      const result = extract(html, article.link);

      if (result.ok && result.value.content) {
        this.#extractedCache.set(article.link, result.value.content);
      } else {
        this.#extractedCache.set(
          article.link,
          "<p>Could not extract readable content from this page.</p>",
        );
      }
    } catch {
      this.#extractedCache.set(
        article.link,
        "<p>Extraction failed. Please try again.</p>",
      );
    }

    // If extracted content is similar to feed, snap back to feed view
    const feedContent = article.content || article.summary || "";
    if (
      this.#contentsSimilar(feedContent, this.#extractedCache.get(article.link))
    ) {
      this.#viewMode = "feed";
    }

    // Only re-render if this is still the active article
    if (this.#article === article) {
      this.#render();
    }
  }

  #escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

customElements.define("article-view", ArticleView);
