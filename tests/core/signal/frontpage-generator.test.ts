import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateFrontpage } from "../../../src/core/signal/frontpage-generator.ts";
import type { Article, Feed, Folder } from "../../../src/types";

const KEY = "sk-ant-test-XXXX";
const NOW = new Date("2026-05-09T12:00:00Z").getTime();

function makeArticle(overrides: Partial<Article> & { id: string }): Article {
  return {
    id: overrides.id,
    feedId: overrides.feedId ?? "feed-bbc",
    guid: overrides.guid ?? overrides.id,
    title: overrides.title ?? "Untitled",
    link: overrides.link ?? `https://example.com/${overrides.id}`,
    content: "",
    summary: overrides.summary ?? "",
    author: "",
    publishedAt: overrides.publishedAt ?? NOW - 60 * 60 * 1000,
    read: false,
    createdAt: NOW,
  };
}

const FEEDS: Feed[] = [
  { id: "feed-bbc", url: "u", title: "BBC News", description: "", siteUrl: "https://bbc.com", folderId: "f-world", createdAt: 0, updatedAt: 0 },
  { id: "feed-aljazeera", url: "u", title: "Al Jazeera", description: "", siteUrl: "https://aljazeera.com", folderId: "f-world", createdAt: 0, updatedAt: 0 },
  { id: "feed-hn", url: "u", title: "Hacker News", description: "", siteUrl: "https://news.ycombinator.com", folderId: "f-tech", createdAt: 0, updatedAt: 0 },
];

const FOLDERS: Folder[] = [
  { id: "f-world", name: "World", createdAt: 0 },
  { id: "f-tech", name: "Tech", createdAt: 0 },
];

const ARTICLES: Article[] = [
  makeArticle({ id: "a1", feedId: "feed-bbc", title: "BBC: Election results announced" }),
  makeArticle({ id: "a2", feedId: "feed-aljazeera", title: "Al Jazeera: Election results today" }),
  makeArticle({ id: "a3", feedId: "feed-hn", title: "New Rust release lands" }),
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function anthropicSuccess(payload: unknown): Response {
  return jsonResponse({
    id: "msg",
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: JSON.stringify(payload) }],
  });
}

describe("generateFrontpage", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns ok with an ordered list of top stories on a 200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      anthropicSuccess({
        topStories: [
          { headline: "Election results", blurb: "B.", articleIds: ["a1", "a2"] },
          { headline: "Rust ships", blurb: "B.", articleIds: ["a3"] },
        ],
      }),
    );
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topStories).toHaveLength(2);
    expect(result.value.topStories[0].headline).toBe("Election results");
    expect(result.value.topStories[1].headline).toBe("Rust ships");
  });

  it("uses Sonnet (not Haiku)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.model).toMatch(/sonnet/i);
  });

  it("sends real feed titles (not anonymized)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    expect(userMessage).toContain("BBC News");
    expect(userMessage).toContain("Hacker News");
    expect(userMessage).not.toMatch(/Outlet [A-Z]/);
  });

  it("includes folder names and article publish dates", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    const dated = makeArticle({
      id: "d1",
      feedId: "feed-bbc",
      title: "Dated story",
      publishedAt: new Date("2026-05-09T10:30:00Z").getTime(),
    });
    await generateFrontpage(
      [dated],
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    expect(userMessage).toContain("World");
    expect(userMessage).toContain("2026-05-09");
  });

  it("includes today's date and recency rule in the prompt", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    expect(userMessage.toLowerCase()).toMatch(/today is/);
    expect(userMessage.toLowerCase()).toMatch(/recent|recency|fresh/);
  });

  it("asks for a top-10 list (or close to it)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    // Whether the prompt says "10 stories" or "the top ten" is a wording choice;
    // the assertion is that it asks for ten, in some form.
    expect(userMessage).toMatch(/\b(10|ten)\b/i);
  });

  it("does not mention swimlanes in the prompt or schema", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    expect(userMessage.toLowerCase()).not.toMatch(/swimlane|topical lane/);
  });

  it("instructs the LLM to balance coverage across folders", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const userMessage = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
      .messages[0].content as string;
    expect(userMessage.toLowerCase()).toMatch(/diversity|diverse|each folder|balance/);
  });

  it("filters out top stories with hallucinated article ids", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      anthropicSuccess({
        topStories: [
          { headline: "Real", blurb: "B.", articleIds: ["a1", "a2"] },
          { headline: "Hallucinated", blurb: "B.", articleIds: ["nonexistent"] },
        ],
      }),
    );
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topStories).toHaveLength(1);
  });

  it("returns err on 401", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "x" } }, { status: 401 }));
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("api key");
  });

  it("returns err on 429 with rate-limit phrasing", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: "x" } }, { status: 429 }));
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/rate|throttl/);
  });

  it("never includes the api key in the returned error", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { message: KEY } }, { status: 500 }));
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).not.toContain(KEY);
  });

  it("aborts cleanly when the signal is aborted", async () => {
    const controller = new AbortController();
    globalThis.fetch = vi.fn().mockImplementation((_url, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    const promise = generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      controller.signal,
    );
    controller.abort();
    const result = await promise;
    expect(result.ok).toBe(false);
  });

  it("returns ok with empty topStories when LLM produces nothing", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(anthropicSuccess({ topStories: [] }));
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topStories).toHaveLength(0);
  });

  it("returns err if response JSON is malformed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: "not json" }] }),
    );
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
  });

  it("requests enough output tokens to fit a full top-10 list without truncation", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      anthropicSuccess({ topStories: [] }),
    );
    globalThis.fetch = fetchSpy;
    await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.max_tokens).toBeGreaterThanOrEqual(4000);
  });

  it("surfaces a clear error when the model hits max_tokens and the JSON is incomplete", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        content: [
          {
            type: "text",
            text: '{"topStories":[{"headline":"Truncated","blurb":"x","articleIds":["a1"',
          },
        ],
        stop_reason: "max_tokens",
      }),
    );
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toMatch(/cut off|truncat|too long/);
  });

  it("parses JSON wrapped in a markdown fence", async () => {
    const fenced =
      '```json\n{"topStories":[{"headline":"H","blurb":"B","articleIds":["a1"]}]}\n```';
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ content: [{ type: "text", text: fenced }] }),
    );
    const result = await generateFrontpage(
      ARTICLES,
      { feeds: FEEDS, folders: FOLDERS },
      KEY,
      new AbortController().signal,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.topStories).toHaveLength(1);
    expect(result.value.topStories[0].headline).toBe("H");
  });
});
