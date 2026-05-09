import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { handleFeedbackRequest } from "@/core/feedback/feedback-handler";

const ENDPOINT = "http://localhost/api/feedback";

function postJson(body: unknown): Request {
  return new Request(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("handleFeedbackRequest", () => {
  let originalToken: string | undefined;
  let originalProjectId: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalToken = process.env.GITLAB_FEEDBACK_TOKEN;
    originalProjectId = process.env.GITLAB_PROJECT_ID;
    process.env.GITLAB_FEEDBACK_TOKEN = "test-token";
    process.env.GITLAB_PROJECT_ID = "12345";
  });

  afterEach(() => {
    process.env.GITLAB_FEEDBACK_TOKEN = originalToken;
    process.env.GITLAB_PROJECT_ID = originalProjectId;
  });

  it("rejects non-POST methods with 405", async () => {
    const res = await handleFeedbackRequest(
      new Request(ENDPOINT, { method: "GET" }),
    );
    expect(res.status).toBe(405);
  });

  it("returns 503 when GITLAB_FEEDBACK_TOKEN is missing", async () => {
    delete process.env.GITLAB_FEEDBACK_TOKEN;
    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 503 when GITLAB_PROJECT_ID is missing", async () => {
    delete process.env.GITLAB_PROJECT_ID;
    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.status).toBe(503);
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await handleFeedbackRequest(
      new Request(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/Invalid JSON/i);
  });

  it("returns 400 when message is missing", async () => {
    const res = await handleFeedbackRequest(postJson({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/required/i);
  });

  it("returns 400 when message is whitespace-only", async () => {
    const res = await handleFeedbackRequest(postJson({ message: "   \n\t  " }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when message exceeds 2000 characters", async () => {
    const tooLong = "x".repeat(2001);
    const res = await handleFeedbackRequest(
      postJson({ message: tooLong }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/too long/i);
    expect(body.error).toMatch(/2000/);
  });

  it("posts the message to the GitLab issues API and returns ok:true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 1 }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await handleFeedbackRequest(
      postJson({ message: "User can't subscribe to a feed at example.com" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gitlab.com/api/v4/projects/12345/issues");
    expect(init.method).toBe("POST");
    expect(init.headers["PRIVATE-TOKEN"]).toBe("test-token");

    const sent = JSON.parse(init.body);
    expect(sent.title).toMatch(/Feedback:/);
    expect(sent.title).toContain("example.com");
    expect(sent.description).toBe("User can't subscribe to a feed at example.com");
    expect(sent.labels).toBe("feedback");
  });

  it("truncates the issue title at 80 characters with an ellipsis", async () => {
    const longMessage = "a".repeat(150);
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await handleFeedbackRequest(postJson({ message: longMessage }));

    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    // "Feedback: " (10 chars) + 80 chars + "…"
    expect(sent.title).toMatch(/^Feedback: a{80}…$/);
  });

  it("returns 502 when GitLab responds non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })),
    );

    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/try again/i);
  });

  it("returns 502 when fetch throws (network/timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("fetch failed")),
    );

    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/try again/i);
  });

  it("sets nosniff and json content-type on every response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
    );
    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});
