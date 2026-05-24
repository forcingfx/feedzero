import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Article } from "@feedzero/core/types";
import { generateBriefing } from "@/core/briefings/briefing-client";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

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

function relayResponse(input: unknown, status = 200) {
  return new Response(
    JSON.stringify({
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
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

function errorResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("generateBriefing", () => {
  it("returns a parsed BriefingReport when the relay returns a tool_use block", async () => {
    const a1 = article({ id: "a1", title: "EU AI Act enters force" });
    const a2 = article({ id: "a2", title: "Commission opens AI inquiry" });

    fetchMock.mockResolvedValueOnce(
      relayResponse({
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

  it("POSTs to /api/briefing with the API key in the x-api-key header (never in the body)", async () => {
    fetchMock.mockResolvedValueOnce(
      relayResponse({ abstract: "x", citations: [], suggestedFeeds: [] }),
    );

    await generateBriefing({
      prompt: "anything",
      articles: [article({ id: "a1", title: "x" })],
      apiKey: "sk-ant-secret",
      modelId: "claude-opus-4-7",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/briefing");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("sk-ant-secret");
    expect(init.headers["anthropic-version"]).toBe("2023-06-01");
    expect(init.body).not.toContain("sk-ant-secret"); // key never in body
  });

  it("sends the configured model id, system prompt, and submit_briefing tool", async () => {
    fetchMock.mockResolvedValueOnce(
      relayResponse({ abstract: "x", citations: [], suggestedFeeds: [] }),
    );

    await generateBriefing({
      prompt: "anything",
      articles: [article({ id: "a1", title: "x" })],
      apiKey: "sk-ant-test",
      modelId: "claude-opus-4-7",
    });

    const init = fetchMock.mock.calls[0][1];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("claude-opus-4-7");
    expect(typeof body.system).toBe("string");
    // web_search + submit_briefing — two tools so the model can verify
    // feeds before suggesting them.
    expect(body.tools).toHaveLength(2);
    expect(body.tools.map((t: { name: string }) => t.name)).toContain(
      "submit_briefing",
    );
    expect(body.tools.map((t: { name: string }) => t.name)).toContain(
      "web_search",
    );
    // tool_choice is "auto" so the model can run web_search before the
    // mandatory submit_briefing call; the prompt + response shape
    // contract forces submit_briefing to be the final block.
    expect(body.tool_choice).toEqual({ type: "auto" });
    expect(body.messages[0].role).toBe("user");
    expect(JSON.stringify(body.messages[0].content)).toContain("anything");
  });

  it("forwards the AbortSignal to fetch", async () => {
    fetchMock.mockResolvedValueOnce(
      relayResponse({ abstract: "x", citations: [], suggestedFeeds: [] }),
    );
    const controller = new AbortController();
    await generateBriefing({
      prompt: "anything",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
      signal: controller.signal,
    });
    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBe(controller.signal);
  });

  it("maps a 401 from the relay (invalid key) to actionable copy pointing at Settings", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(401));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-bad",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("invalid");
    expect(result.error.toLowerCase()).toContain("settings");
  });

  it("maps a 429 (rate limit) and surfaces Retry-After when present", async () => {
    const res = errorResponse(429);
    res.headers.set("retry-after", "30");
    fetchMock.mockResolvedValueOnce(res);
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("rate");
    expect(result.error).toContain("30s");
  });

  it("maps a 502 (relay couldn't reach Anthropic) to the 'couldn't reach' message", async () => {
    fetchMock.mockResolvedValueOnce(errorResponse(502, { error: "upstream timeout" }));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("couldn't reach");
  });

  it("maps a network failure (fetch threw) with the underlying message", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.toLowerCase()).toContain("relay");
    expect(result.error.toLowerCase()).toContain("failed to fetch");
  });

  it("maps an AbortError from fetch to the cancelled message", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    fetchMock.mockRejectedValueOnce(abortErr);
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
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [{ type: "text", text: "I cannot do that" }],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await generateBriefing({
      prompt: "x",
      articles: [article()],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(false);
  });

  it("returns an error when the tool input fails schema validation (missing abstract)", async () => {
    fetchMock.mockResolvedValueOnce(
      relayResponse({ citations: [], suggestedFeeds: [] }),
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
    fetchMock.mockResolvedValueOnce(
      relayResponse({
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

  it("picks the submit_briefing block out of a multi-step web_search response", async () => {
    // Simulates a response where the model ran web_search a couple
    // times before calling submit_briefing. We must find the
    // submit_briefing block specifically — not just the first tool_use.
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          content: [
            { type: "text", text: "I'll search for current sources." },
            {
              type: "server_tool_use",
              id: "ws-1",
              name: "web_search",
              input: { query: "EU AI Act enforcement RSS" },
            },
            {
              type: "web_search_tool_result",
              tool_use_id: "ws-1",
              content: [{ type: "web_search_result", url: "https://x.example", title: "X" }],
            },
            {
              type: "tool_use",
              id: "submit-1",
              name: "submit_briefing",
              input: {
                abstract: "Summary [A1].",
                citations: [{ articleId: "a1", quote: "q" }],
                suggestedFeeds: [
                  {
                    candidateUrl: "https://x.example/feed.xml",
                    rationale: "Verified via web_search.",
                  },
                ],
              },
            },
          ],
          usage: { input_tokens: 2048, output_tokens: 512 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const result = await generateBriefing({
      prompt: "x",
      articles: [article({ id: "a1", title: "x" })],
      apiKey: "sk-ant-test",
      modelId: "claude-sonnet-4-6",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.suggestedFeeds[0].candidateUrl).toBe(
      "https://x.example/feed.xml",
    );
  });
});
