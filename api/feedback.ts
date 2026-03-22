/**
 * Vercel Serverless Function: Feedback
 *
 * Receives user feedback and creates a GitLab issue.
 */
import { handleFeedbackRequest } from "../src/core/feedback/feedback-handler.ts";

export async function POST(req: Request): Promise<Response> {
  return handleFeedbackRequest(req);
}
