const template = document.createElement("template");
template.innerHTML = `
<style>
  :host { display: block; padding: var(--space-md); overflow-y: auto; }
  .empty { color: var(--color-text-secondary); }
  h2 { font-size: 1.5rem; margin-bottom: var(--space-xs); }
  .meta { font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: var(--space-md); }
  .meta a { color: var(--color-accent); }
  .content { line-height: 1.7; }
  .content img { max-width: 100%; height: auto; }
  .content pre { overflow-x: auto; background: var(--color-bg-secondary); padding: var(--space-sm); border-radius: var(--radius); }
  .content blockquote { border-left: 3px solid var(--color-border); padding-left: var(--space-md); color: var(--color-text-secondary); }
</style>
<article>
  <div class="empty">Select an article to read.</div>
</article>
`;

export class ArticleView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  setArticle(article) {
    const container = this.shadowRoot.querySelector("article");

    if (!article) {
      container.innerHTML =
        '<div class="empty">Select an article to read.</div>';
      return;
    }

    const meta = [];
    if (article.author) meta.push(article.author);
    if (article.publishedAt)
      meta.push(new Date(article.publishedAt).toLocaleDateString());

    container.innerHTML = `
      <h2>${this.escapeHtml(article.title)}</h2>
      <div class="meta">
        ${meta.map((m) => this.escapeHtml(m)).join(" &bull; ")}
        ${article.link ? ` &mdash; <a href="${this.escapeHtml(article.link)}" target="_blank" rel="noopener noreferrer">Original</a>` : ""}
      </div>
      <div class="content">${article.content || article.summary || "<p>No content available.</p>"}</div>
    `;
  }

  escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
}

customElements.define("article-view", ArticleView);
