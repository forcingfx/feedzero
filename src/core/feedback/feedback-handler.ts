/**
 * Shared feedback handler. Receives user feedback and creates a GitHub issue.
 *
 * Requires GITHUB_FEEDBACK_TOKEN env var (a GitHub fine-grained PAT or classic
 * token with `repo` scope, scoped to the issues repo) and GITHUB_REPO env var
 * in the form "owner/repo" (e.g. "forcingfx/feedzero").
 *
 * No user identity is collected. The message is the only content posted.
 */

interface FeedbackBody {
  message?: string;
}

const MAX_MESSAGE_LENGTH = 2000;

/**
 * HTTP methods this handler accepts. Used by the routing contract test in
 * server.test.ts to enforce that the Hono server, the Vercel wrapper, and
 * the shared handler all agree on which methods are supported.
 */
export const SUPPORTED_METHODS: readonly string[] = ["POST"];

export async function handleFeedbackRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return jsonResponse(
      { ok: false, error: "Feedback is not configured on this server" },
      503,
    );
  }

  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const message = body.message?.trim();
  if (!message) {
    return jsonResponse({ ok: false, error: "Message is required" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { ok: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      400,
    );
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${repo}/issues`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          // GitHub recommends pinning the API version for stability.
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          title: `Feedback: ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`,
          body: message,
          labels: ["feedback"],
        }),
      },
    );

    if (!response.ok) {
      return jsonResponse(
        { ok: false, error: "Could not submit feedback. Please try again." },
        502,
      );
    }

    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse(
      { ok: false, error: "Could not submit feedback. Please try again." },
      502,
    );
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
