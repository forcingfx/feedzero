// @ts-nocheck
// src/core/feedback/feedback-handler.ts
var MAX_MESSAGE_LENGTH = 2e3;
var MAX_EMAIL_LENGTH = 254;
async function handleFeedbackRequest(request) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
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
  const email = body.email?.trim();
  if (email) {
    if (email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
      return jsonResponse(
        { ok: false, error: "Email looks invalid" },
        400
      );
    }
  }
  const issueBody = email ? `${message}

\u2014 Reply to: ${email}` : message;
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
          "X-GitHub-Api-Version": "2022-11-28"
        },
        body: JSON.stringify({
          title: `Feedback: ${message.slice(0, 80)}${message.length > 80 ? "\u2026" : ""}`,
          body: issueBody,
          labels: ["feedback"]
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
