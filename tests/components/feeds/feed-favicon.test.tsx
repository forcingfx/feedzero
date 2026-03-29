import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import {
  FeedFavicon,
  clearFaviconCache,
  setFaviconCacheEntry,
} from "@/components/feeds/feed-favicon";

describe("FeedFavicon", () => {
  beforeEach(() => {
    clearFaviconCache();
  });

  it("routes favicon requests through the proxy to prevent IP leakage", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.ico",
    );
  });

  it("shows fallback icon when siteUrl is empty", () => {
    const { container } = render(<FeedFavicon siteUrl="" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("tries favicon.png after favicon.ico fails", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img);
    const newImg = container.querySelector("img")!;
    expect(newImg.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.png",
    );
  });

  it("tries apple-touch-icon.png after favicon.png fails", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img); // favicon.ico fails
    fireEvent.error(container.querySelector("img")!); // favicon.png fails
    const newImg = container.querySelector("img")!;
    expect(newImg.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Fapple-touch-icon.png",
    );
  });

  it("shows RSS fallback after all paths exhausted", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img); // favicon.ico
    fireEvent.error(container.querySelector("img")!); // favicon.png
    fireEvent.error(container.querySelector("img")!); // apple-touch-icon.png
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("shows fallback icon for invalid URL", () => {
    const { container } = render(<FeedFavicon siteUrl="not-a-url" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows fallback icon while image is loading", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    expect(container.querySelector("svg")).toBeTruthy();
    const img = container.querySelector("img")!;
    expect(img.classList.contains("hidden")).toBe(true);
  });

  it("hides fallback icon after image loads successfully", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    expect(container.querySelector("svg")).toBeNull();
    expect(img.classList.contains("hidden")).toBe(false);
  });

  it("has visible border on loaded favicon for contrast against white backgrounds", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.load(img);
    expect(img.className).toContain("ring-1");
  });

  it("retries after cached failure once TTL expires", () => {
    // Inject a stale failure (timestamp 0 = expired)
    setFaviconCacheEntry("https://stale.example.com", -1, 0);

    const { container } = render(
      <FeedFavicon siteUrl="https://stale.example.com" />,
    );
    // Expired failure should be ignored — component retries (img present)
    expect(container.querySelector("img")).toBeTruthy();
  });
});
