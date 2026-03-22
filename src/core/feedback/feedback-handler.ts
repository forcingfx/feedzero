/**
 * Shared feedback handler. Receives user feedback and creates a GitLab issue.
 *
 * Requires GITLAB_FEEDBACK_TOKEN env var (project access token with api scope)
 * and GITLAB_PROJECT_ID env var (numeric project ID).
 *
 * No user identity is collected. The message is the only content.
 */

interface FeedbackBody {
  message?: string;
}

const MAX_MESSAGE_LENGTH = 2000;

export async function handleFeedbackRequest(
  request: Request,
): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const token = process.env.GITLAB_FEEDBACK_TOKEN;
  const projectId = process.env.GITLAB_PROJECT_ID;

  if (!token || !projectId) {
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
      `https://gitlab.com/api/v4/projects/${projectId}/issues`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: `Feedback: ${message.slice(0, 80)}${message.length > 80 ? "…" : ""}`,
          description: message,
          labels: "feedback",
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
