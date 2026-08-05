import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toast } from "sonner";
import { shareArticle } from "@/lib/share-article.ts";

vi.mock("sonner", () => ({
  toast: vi.fn(),
}));

describe("shareArticle", () => {
  const shareSpy = vi.fn();
  const writeTextSpy = vi.fn();

  beforeEach(() => {
    vi.mocked(toast).mockClear();
    shareSpy.mockReset().mockResolvedValue(undefined);
    writeTextSpy.mockReset().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: writeTextSpy },
      configurable: true,
    });
  });

  afterEach(() => {
    // Remove the share shim so tests that rely on its absence stay isolated.
    delete (navigator as { share?: unknown }).share;
  });

  it("uses the native share sheet when available", async () => {
    Object.defineProperty(navigator, "share", {
      value: shareSpy,
      configurable: true,
    });

    await shareArticle({ title: "Hello", link: "https://example.com/a" });

    expect(shareSpy).toHaveBeenCalledWith({
      title: "Hello",
      url: "https://example.com/a",
    });
    expect(writeTextSpy).not.toHaveBeenCalled();
  });

  it("falls back to clipboard + toast when native share is unavailable", async () => {
    await shareArticle({ title: "Hello", link: "https://example.com/a" });

    expect(writeTextSpy).toHaveBeenCalledWith("https://example.com/a");
    expect(toast).toHaveBeenCalledWith("Link copied");
  });

  it("treats a cancelled share sheet as a non-event", async () => {
    shareSpy.mockRejectedValue(new DOMException("cancel", "AbortError"));
    Object.defineProperty(navigator, "share", {
      value: shareSpy,
      configurable: true,
    });

    await expect(
      shareArticle({ title: "Hello", link: "https://example.com/a" }),
    ).resolves.toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });

  it("does nothing for an article without a link", async () => {
    await shareArticle({ title: "No link" });

    expect(writeTextSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });
});
