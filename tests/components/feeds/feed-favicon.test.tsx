import { describe, it, expect, beforeEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { FeedFavicon } from "@/components/feeds/feed-favicon";
import {
  clearFaviconCache,
  retryFailedFavicons,
  setFaviconCacheEntry,
} from "@/core/favicon/favicon-cache.ts";

describe("FeedFavicon", () => {
  beforeEach(() => {
    clearFaviconCache();
  });

  it("tries smart favicon endpoint first", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe(
      "/api/favicon?domain=example.com",
    );
  });

  it("shows fallback icon when siteUrl is empty", () => {
    const { container } = render(<FeedFavicon siteUrl="" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("falls back to favicon.ico after smart endpoint fails", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    const img = container.querySelector("img")!;
    fireEvent.error(img); // smart endpoint fails
    const newImg = container.querySelector("img")!;
    expect(newImg.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.ico",
    );
  });

  it("falls back to favicon.png after favicon.ico fails", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    fireEvent.error(container.querySelector("img")!); // smart endpoint
    fireEvent.error(container.querySelector("img")!); // favicon.ico
    const newImg = container.querySelector("img")!;
    expect(newImg.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Ffavicon.png",
    );
  });

  it("falls back to apple-touch-icon after favicon.png fails", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    fireEvent.error(container.querySelector("img")!); // smart endpoint
    fireEvent.error(container.querySelector("img")!); // favicon.ico
    fireEvent.error(container.querySelector("img")!); // favicon.png
    const newImg = container.querySelector("img")!;
    expect(newImg.getAttribute("src")).toBe(
      "/api/icon?url=https%3A%2F%2Fexample.com%2Fapple-touch-icon.png",
    );
  });

  it("shows RSS fallback after all strategies exhausted", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    fireEvent.error(container.querySelector("img")!); // smart endpoint
    fireEvent.error(container.querySelector("img")!); // favicon.ico
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
    setFaviconCacheEntry("https://stale.example.com", -1, 0);

    const { container } = render(
      <FeedFavicon siteUrl="https://stale.example.com" />,
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("re-attempts an on-screen failed favicon after retryFailedFavicons", () => {
    const { container } = render(<FeedFavicon siteUrl="https://example.com" />);
    fireEvent.error(container.querySelector("img")!); // smart endpoint
    fireEvent.error(container.querySelector("img")!); // favicon.ico
    fireEvent.error(container.querySelector("img")!); // favicon.png
    fireEvent.error(container.querySelector("img")!); // apple-touch-icon.png
    expect(container.querySelector("img")).toBeNull(); // exhausted → RSS fallback

    act(() => retryFailedFavicons());

    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img!.getAttribute("src")).toBe("/api/favicon?domain=example.com");
  });
});
