import { describe, it, expect, beforeEach } from "vitest";
import "../../../src/ui/components/article-view.js";

describe("ArticleView", () => {
  let el;

  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("article-view");
    document.body.appendChild(el);
  });

  it("should render empty state", () => {
    expect(el.shadowRoot.querySelector(".empty").textContent).toContain(
      "Select an article",
    );
  });

  it("should render article content", () => {
    el.setArticle({
      title: "Test Post",
      author: "Alice",
      publishedAt: new Date("2024-01-15").getTime(),
      link: "https://example.com/1",
      content: "<p>Hello world</p>",
    });
    expect(el.shadowRoot.querySelector("h2").textContent).toBe("Test Post");
    expect(el.shadowRoot.querySelector(".content").innerHTML).toContain(
      "Hello world",
    );
    expect(el.shadowRoot.querySelector(".meta").textContent).toContain("Alice");
    expect(el.shadowRoot.querySelector("a").getAttribute("href")).toBe(
      "https://example.com/1",
    );
  });

  it("should escape title to prevent XSS", () => {
    el.setArticle({
      title: "<img src=x onerror=alert(1)>",
      link: "",
      content: "safe",
    });
    const h2 = el.shadowRoot.querySelector("h2");
    expect(h2.textContent).toBe("<img src=x onerror=alert(1)>");
    expect(h2.innerHTML).not.toContain("<img");
  });

  it("should show fallback for missing content", () => {
    el.setArticle({ title: "Empty", link: "" });
    expect(el.shadowRoot.querySelector(".content").textContent).toContain(
      "No content available",
    );
  });

  it("should reset to empty state", () => {
    el.setArticle({ title: "X", link: "", content: "Y" });
    el.setArticle(null);
    expect(el.shadowRoot.querySelector(".empty")).not.toBeNull();
  });
});
