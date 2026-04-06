// src/core/feedback/feedback-handler.ts
var MAX_MESSAGE_LENGTH = 2e3;
async function handleFeedbackRequest(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const token = process.env.GITLAB_FEEDBACK_TOKEN;
  const projectId = process.env.GITLAB_PROJECT_ID;
  if (!token || !projectId) {
    return jsonResponse(
      { ok: false, error: "Feedback is not configured on this server" },
      503
    );
  }
  let body;
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
      400
    );
  }
  try {
    const response = await fetch(
      `https://gitlab.com/api/v4/projects/${projectId}/issues`,
      {
        method: "POST",
        headers: {
          "PRIVATE-TOKEN": token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: `Feedback: ${message.slice(0, 80)}${message.length > 80 ? "\u2026" : ""}`,
          description: message,
          labels: "feedback"
        })
      }
    );
    if (!response.ok) {
      return jsonResponse(
        { ok: false, error: "Could not submit feedback. Please try again." },
        502
      );
    }
    return jsonResponse({ ok: true });
  } catch {
    return jsonResponse(
      { ok: false, error: "Could not submit feedback. Please try again." },
      502
    );
  }
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

// api/feedback.ts
async function POST(req) {
  return handleFeedbackRequest(req);
}
export {
  POST
};
