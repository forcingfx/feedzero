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
  let originalRepo: string | undefined;
  let originalLegacyToken: string | undefined;
  let originalLegacyProject: string | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    originalToken = process.env.GITHUB_FEEDBACK_TOKEN;
    originalRepo = process.env.GITHUB_REPO;
    originalLegacyToken = process.env.GITLAB_FEEDBACK_TOKEN;
    originalLegacyProject = process.env.GITLAB_PROJECT_ID;
    process.env.GITHUB_FEEDBACK_TOKEN = "test-token";
    process.env.GITHUB_REPO = "forcingfx/feedzero";
    // Ensure the legacy GitLab vars do not accidentally satisfy the configured-check.
    delete process.env.GITLAB_FEEDBACK_TOKEN;
    delete process.env.GITLAB_PROJECT_ID;
  });

  afterEach(() => {
    process.env.GITHUB_FEEDBACK_TOKEN = originalToken;
    process.env.GITHUB_REPO = originalRepo;
    process.env.GITLAB_FEEDBACK_TOKEN = originalLegacyToken;
    process.env.GITLAB_PROJECT_ID = originalLegacyProject;
  });

  it("rejects non-POST methods with 405", async () => {
    const res = await handleFeedbackRequest(
      new Request(ENDPOINT, { method: "GET" }),
    );
    expect(res.status).toBe(405);
  });

  it("returns 503 when GITHUB_FEEDBACK_TOKEN is missing", async () => {
    delete process.env.GITHUB_FEEDBACK_TOKEN;
    const res = await handleFeedbackRequest(postJson({ message: "Hi" }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/not configured/i);
  });

  it("returns 503 when GITHUB_REPO is missing", async () => {
    delete process.env.GITHUB_REPO;
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

  it("posts the message to the GitHub issues API and returns ok:true", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ number: 1 }), { status: 201 }),
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
    expect(url).toBe("https://api.github.com/repos/forcingfx/feedzero/issues");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(init.headers.Accept).toBe("application/vnd.github+json");
    expect(init.headers["X-GitHub-Api-Version"]).toBe("2022-11-28");

    const sent = JSON.parse(init.body);
    expect(sent.title).toMatch(/Feedback:/);
    expect(sent.title).toContain("example.com");
    // GitHub uses `body` (not `description` like GitLab) and an array of label names.
    expect(sent.body).toBe("User can't subscribe to a feed at example.com");
    expect(sent.labels).toEqual(["feedback"]);
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

  it("returns 502 when GitHub responds non-OK", async () => {
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
