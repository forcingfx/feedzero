import { handleFeedbackRequest } from "../src/core/feedback/feedback-handler";

export async function POST(req: Request): Promise<Response> {
  return handleFeedbackRequest(req);
}
