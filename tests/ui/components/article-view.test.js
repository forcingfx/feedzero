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

  it("should hide toggle when only feed mode is available", () => {
    el.setArticle({
      title: "No Summary",
      link: "",
      content: "<p>Full content here</p>",
    });
    expect(el.shadowRoot.querySelector(".view-toggle")).toBeNull();
  });

  it("should hide summary button when summary matches feed content", () => {
    el.setArticle({
      title: "Similar",
      link: "https://example.com/2",
      content:
        "<p>This is the full article content with many details about the topic at hand.</p>",
      summary: "This is the full article content with many details",
    });
    const buttons = el.shadowRoot.querySelectorAll(".view-toggle button");
    const labels = [...buttons].map((b) => b.textContent);
    expect(labels).not.toContain("Summary");
  });

  it("should show summary button when summary differs from feed", () => {
    el.setArticle({
      title: "Different",
      link: "https://example.com/3",
      content:
        "<p>Full article with lots of unique content that is very different from the summary.</p>",
      summary:
        "A completely different teaser that does not overlap with the article.",
    });
    const buttons = el.shadowRoot.querySelectorAll(".view-toggle button");
    const labels = [...buttons].map((b) => b.textContent);
    expect(labels).toContain("Summary");
  });

  it("should show timestamp with hours and minutes", () => {
    el.setArticle({
      title: "Timestamp",
      author: "Bob",
      publishedAt: new Date("2024-06-15T14:30:00").getTime(),
      link: "",
      content: "text",
    });
    const meta = el.shadowRoot.querySelector(".meta").textContent;
    // Should contain time portion (hours:minutes), not just date
    expect(meta).toMatch(/\d{1,2}:\d{2}/);
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
