/**
 * Shared feedback handler. Receives user feedback and creates a GitHub issue.
 *
 * Requires GITHUB_FEEDBACK_TOKEN env var (a GitHub fine-grained PAT or classic
 * token with `repo` scope, scoped to the issues repo) and GITHUB_REPO env var
 * in the form "owner/repo" (e.g. "forcingfx/feedzero").
 *
 * Anonymous by default. If the user supplies an email, it is appended to the
 * issue body as a "Reply to:" line so the maintainer can email them back. The
 * UI surfaces a warning that the email becomes part of the public issue
 * before the user types it — see <FeedbackDialog>.
 */

import { logError } from "../../../packages/core/src/utils/log-error";
import { newTraceId } from "../../../packages/core/src/utils/trace-id";

const ROUTE = "/api/feedback";
const MAX_MESSAGE_LENGTH = 2000;
const TOKEN_EXPIRY_HEADER = "github-authentication-token-expiration";
const TOKEN_EXPIRY_WARNING_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EMAIL_LENGTH = 254;

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
    return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
  }

  const token = process.env.GITHUB_FEEDBACK_TOKEN;
  const repo = process.env.GITHUB_REPO;

  if (!token || !repo) {
    return jsonResponse(
      { ok: false, error: "Feedback is not configured on this server" },
      503,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
  }

  const message = readTrimmedString(payload, "message");
  if (!message) {
    return jsonResponse({ ok: false, error: "Message is required" }, 400);
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse(
      { ok: false, error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      400,
    );
  }

  // Email is optional. Reject obviously malformed values so a stray copy-paste
  // doesn't end up in the public issue body, but keep validation permissive —
  // the maintainer is the one who'll actually try replying.
  const email = readTrimmedString(payload, "email");
  if (email) {
    if (email.length > MAX_EMAIL_LENGTH || !email.includes("@")) {
      return jsonResponse(
        { ok: false, error: "Email looks invalid" },
        400,
      );
    }
  }

  const issueBody = email ? `${message}\n\n— Reply to: ${email}` : message;

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
          body: issueBody,
          labels: ["feedback"],
        }),
      },
    );

    if (!response.ok) {
      return upstreamFailure("GitHubRejected", `upstream ${response.status}`);
    }

    warnIfTokenExpiresSoon(response.headers.get(TOKEN_EXPIRY_HEADER));
    return jsonResponse({ ok: true });
  } catch (err) {
    return upstreamFailure(errorClassOf(err), "GitHub request failed");
  }
}

/**
 * Answer the user with a generic 502 and log the cause for the operator.
 * The log carries only GitHub's status or the error class, never the
 * message or reply-to email (ADR 032): enough to tell an expired token
 * (401) from a GitHub outage (5xx).
 */
function upstreamFailure(errClass: string, errMsg: string): Response {
  const status = 502;
  logError({ route: ROUTE, method: "POST", status, traceId: newTraceId(), errClass, errMsg });
  return jsonResponse(
    { ok: false, error: "Could not submit feedback. Please try again." },
    status,
  );
}

/**
 * Log a warning once the GitHub token has under two weeks left. GitHub
 * stamps every response made with a fine-grained token with its expiry
 * (e.g. "2027-11-08 11:36:55 UTC"); without this, the first sign of an
 * expired token was users unable to send feedback, for months.
 */
function warnIfTokenExpiresSoon(expiryHeader: string | null): void {
  const expiresAt = parseGitHubTimestamp(expiryHeader);
  if (expiresAt === null) return;
  const daysLeft = Math.floor((expiresAt - Date.now()) / DAY_MS);
  if (daysLeft >= TOKEN_EXPIRY_WARNING_DAYS) return;
  logError({
    route: ROUTE,
    method: "POST",
    status: 200,
    traceId: newTraceId(),
    errClass: "TokenExpiringSoon",
    errMsg: `GITHUB_FEEDBACK_TOKEN expires in ${daysLeft} days`,
  });
}

function parseGitHubTimestamp(value: string | null): number | null {
  if (!value) return null;
  const iso = value.trim().replace(" UTC", "Z").replace(" ", "T");
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
}

function errorClassOf(err: unknown): string {
  return err instanceof Error ? err.constructor.name : "Unknown";
}

/**
 * Read one field of the request payload as a trimmed string, or `undefined`.
 *
 * Every value `JSON.parse` accepts arrives here: `null`, arrays, bare strings
 * and numbers are all valid JSON documents, and a well-formed object can still
 * carry a number where a string belongs. Reaching straight for `.trim()` threw
 * a TypeError that escaped the handler, and a rejected handler promise is not
 * a response — the serverless platform answered with its own HTML 500 page.
 * The dialog cannot parse HTML, so it reported a *server crash* as a *network
 * failure* and pointed the user at their connection. Narrowing to string here
 * keeps every malformed payload on the 400-JSON path.
 */
function readTrimmedString(
  payload: unknown,
  field: string,
): string | undefined {
  if (typeof payload !== "object" || payload === null) return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === "string" ? value.trim() : undefined;
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
