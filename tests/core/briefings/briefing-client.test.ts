import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Article } from "@feedzero/core/types";

// Mock the Anthropic SDK before importing the client. vi.mock is hoisted
// to the top of the file, so anything it references must be hoisted too —
// vi.hoisted() lets the test file share state with the mock factory.
const mocks = vi.hoisted(() => {
  const createMock = vi.fn();
  class MockAuthenticationError extends Error {}
  class MockRateLimitError extends Error {}
  class MockAPIConnectionError extends Error {}
  class MockAPIUserAbortError extends Error {}
  return {
    createMock,
    MockAuthenticationError,
    MockRateLimitError,
    MockAPIConnectionError,
    MockAPIUserAbortError,
  };
});

const { createMock } = mocks;
const {
  MockAuthenticationError,
  MockRateLimitError,
  MockAPIUserAbortError,
} = mocks;

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class MockAnthropic {
      messages = { create: mocks.createMock };
      constructor(public opts: { apiKey: string; dangerouslyAllowBrowser?: boolean }) {}
    },
    AuthenticationError: mocks.MockAuthenticationError,
    RateLimitError: mocks.MockRateLimitError,
    APIConnectionError: mocks.MockAPIConnectionError,
    APIUserAbortError: mocks.MockAPIUserAbortError,
  };
});

import { generateBriefing } from "@/core/briefings/briefing-client";

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    feedId: overrides.feedId ?? "feed-1",
    guid: overrides.guid ?? crypto.randomUUID(),
    title: overrides.title ?? "Untitled",
    link: overrides.link ?? "https://example.com/x",
    content: overrides.content ?? "",
    summary: overrides.summary ?? "",
    author: overrides.author ?? "",
    publishedAt: overrides.publishedAt ?? Date.now(),
    read: false,
    createdAt: Date.now(),
    ...overrides,
  };
}

function toolUseResponse(input: unknown) {
  return {
    content: [
      {
        type: "tool_use",
        id: "tool-1",
        name: "submit_briefing",
        input,
      },
    ],
    usage: { input_tokens: 1024, output_tokens: 320 },
    stop_reason: "tool_use",
  };
}

describe("generateBriefing", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns a parsed BriefingReport when the model emits the tool", async () => {
    const a1 = article({ id: "a1", title: "EU AI Act enters force" });
    const a2 = article({ id: "a2", title: "Commission opens AI inquiry" });

    createMock.mockResolvedValueOnce(
      toolUseResponse({
        abstract: "Key developments [A1] [A2].",
        citations: [
          { articleId: "a1", quote: "Act enters force." },
          { articleId: "a2", quote: "Commission opens inquiry." },
        ],
        suggestedFeeds: [
          {
            candidateUrl: "https://example.com/eu-policy.xml",
            rationale: "Tracks EU regulatory rulings weekly.",
          },
        ],
      }),
    );

    const result = await generateBriefing({
      prompt: "EU AI Act enforcement actions.",
      articles: [a1, a2],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.abstract).toContain("[A1]");
    expect(result.value.citations).toHaveLength(2);
    expect(result.value.citations[0].articleId).toBe("a1");
    expect(result.value.suggestedFeeds[0].candidateUrl).toBe(
      "https://example.com/eu-policy.xml",
    );
    expect(result.value.suggestedFeeds[0].discoveryStatus).toBe("pending");
    expect(result.value.tokenUsage).toEqual({ input: 1024, output: 320 });
    expect(result.value.modelId).toBe("claude-sonnet-4-6");
    expect(result.value.matchedArticleIds).toEqual(["a1", "a2"]);
    expect(result.value.schemaVersion).toBe(1);
  });

  it("sends the configured model id, system prompt, and submit_briefing tool", async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse({
        abstract: "x",
        citations: [],
        suggestedFeeds: [],
      }),
    );

    await generateBriefing({
      prompt: "anything",
      articles: [article({ id: "a1", title: "x" })],
      apiKey: "sk-ant-test",
      modelId: "claude-opus-4-7",
    });

    expect(createMock).toHaveBeenCalledTimes(1);
    const call = createMock.mock.calls[0][0];
    expect(call.model).toBe("claude-opus-4-7");
    expect(typeof call.system).toBe("string");
    expect(call.tools).toHaveLength(1);
    expect(call.tools[0].name).toBe("submit_briefing");
    expect(call.tool_choice).toEqual({ type: "tool", name: "submit_briefing" });
    // The user message must include the prompt verbatim
    const userMsg = call.messages[0];
    expect(userMsg.role).toBe("user");
    const text = JSON.stringify(userMsg.content);
    expect(text).toContain("anything");
  });

  it("forwards the AbortSignal to the SDK", async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse({ abstract: "x", citations: [], suggestedFeeds: [] }),
    );
    const controller = new AbortController();
    await generateBriefing({
      prompt: "anything",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      signal: controller.signal,
    });
    const opts = createMock.mock.calls[0][1];
    expect(opts.signal).toBe(controller.signal);
  });

  it("maps authentication errors to a friendly Result.err", async () => {
    createMock.mockRejectedValueOnce(new MockAuthenticationError("bad key"));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-bad",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("invalid");
  });

  it("maps rate-limit errors to a Result.err that the UI can show", async () => {
    createMock.mockRejectedValueOnce(new MockRateLimitError("rate limited"));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("rate");
  });

  it("maps user aborts to a Result.err with an abort marker", async () => {
    createMock.mockRejectedValueOnce(new MockAPIUserAbortError("aborted"));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("cancel");
  });

  it("returns an error when the response has no tool_use block (model went off-script)", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ type: "text", text: "Hi I cannot do that" }],
      usage: { input_tokens: 10, output_tokens: 5 },
      stop_reason: "end_turn",
    });
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
  });

  it("returns an error when the tool input fails schema validation", async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse({
        // missing abstract; should fail validation
        citations: [],
        suggestedFeeds: [],
      }),
    );
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
  });

  it("caps suggestedFeeds at 5 (defensive trim if the model overshoots)", async () => {
    createMock.mockResolvedValueOnce(
      toolUseResponse({
        abstract: "x",
        citations: [],
        suggestedFeeds: Array.from({ length: 12 }, (_, i) => ({
          candidateUrl: `https://example.com/${i}.xml`,
          rationale: "because",
        })),
      }),
    );
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestedFeeds).toHaveLength(5);
  });
});
