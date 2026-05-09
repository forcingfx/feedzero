import { ok, err, type Result } from "../../utils/result.ts";
import type { Article, Feed, Folder } from "../../types";
import {
  SIGNAL_SWIMLANES_TARGET,
  SIGNAL_TOP_STORIES_TARGET,
  type Frontpage,
  type FrontpageStory,
  type Swimlane,
} from "./types.ts";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 3000;
const TITLE_CHAR_BUDGET = 200;
const SUMMARY_CHAR_BUDGET = 220;
const UNFILED_LABEL = "Unfiled";

export interface FrontpageContext {
  feeds: Feed[];
  folders: Folder[];
}

/**
 * One LLM call produces both the top stories (for the masonry) and the
 * swimlanes (topical lanes below). Browser-direct, BYO Anthropic key.
 */
export async function generateFrontpage(
  articles: Article[],
  context: FrontpageContext,
  apiKey: string,
  signal: AbortSignal,
): Promise<Result<Frontpage>> {
  const feedById = indexBy(context.feeds, (f) => f.id);
  const folderById = indexBy(context.folders, (f) => f.id);
  const prompt = buildPrompt(articles, feedById, folderById);

  let response: Response;
  try {
    response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "anthropic-dangerous-direct-browser-access": "true",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return err("Request aborted");
    }
    return err("Couldn't reach Anthropic");
  }

  if (!response.ok) {
    return err(friendlyStatusError(response.status));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return err("Anthropic returned an unreadable response");
  }

  const text = extractTextBlock(body);
  if (!text) return err("Anthropic returned no text content");

  const parsed = extractJsonObject(text);
  if (!parsed) return err("Anthropic response was not valid JSON");

  const knownIds = new Set(articles.map((a) => a.id));
  return ok({
    topStories: extractTopStories(parsed, knownIds),
    swimlanes: extractSwimlanes(parsed, knownIds),
  });
}

function indexBy<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(key(item), item);
  return map;
}

function buildPrompt(
  articles: Article[],
  feedById: Map<string, Feed>,
  folderById: Map<string, Folder>,
): string {
  const folderCount = countDistinctFolders(articles, feedById);
  const today = new Date().toISOString().slice(0, 10);
  const lines = articles.map((a, i) => {
    const feed = feedById.get(a.feedId);
    const sourceName = feed?.title?.trim() || "Unknown source";
    const folderName = feed?.folderId
      ? folderById.get(feed.folderId)?.name?.trim() || UNFILED_LABEL
      : UNFILED_LABEL;
    const title = truncate(a.title, TITLE_CHAR_BUDGET);
    const summary = truncate(stripHtml(a.summary), SUMMARY_CHAR_BUDGET);
    const summaryLine = summary ? `\n   ${summary}` : "";
    const date = formatPromptDate(a.publishedAt);
    return `${i + 1}. [id=${a.id}] (${sourceName} · ${folderName} · ${date}) ${title}${summaryLine}`;
  });

  return [
    `You are an editor for a personal news magazine. Today is ${today}. The reader has organized their feed subscriptions into topical folders. Build a frontpage from the recent articles below.`,
    "",
    "The frontpage has TWO parts:",
    `1. **Top stories** (${SIGNAL_TOP_STORIES_TARGET} stories): the most important things happening right now. Each is a magazine-style headline + one-sentence blurb that synthesizes coverage from one or more outlets. Strong preference for multi-source events, but include a single-source story if it's clearly significant.`,
    `2. **Swimlanes** (${SIGNAL_SWIMLANES_TARGET} lanes): topical clusters with their own short title (e.g. "Iran War", "Apple M5 launch", "UK politics"). Each lane lists 4-8 article ids that fit the theme. The reader will swipe through them.`,
    "",
    "Recency rules (these are first-class — a stale story does not deserve the front page):",
    `- Strongly prefer articles from the last 24 hours.`,
    `- A story from 2+ days ago should appear only if it's still actively developing or genuinely consequential.`,
    `- Top stories MUST be from today or yesterday.`,
    "",
    "Diversity rules (the magazine should reflect the reader's full set of interests):",
    `- The reader's articles span these folders: ${listFolders(folderCount)}.`,
    "- Aim for at least one top story or swimlane from each folder that has meaningful content.",
    "- Don't let any single folder dominate top stories: at most 3 of the top stories from any one folder.",
    "- Tech, hobby, and niche stories are valuable — don't default to international news.",
    "",
    "Quality rules:",
    "- Skip listicles, opinion pieces, lifestyle filler, and clickbait.",
    "- Don't invent article ids. Only use ids that appear in the list.",
    "- Headlines: 8 words or fewer, no clickbait, no trailing punctuation.",
    "- Blurbs: a single factual, neutral sentence of 25 words or fewer.",
    "- Swimlane titles: 1-4 words, descriptive, no punctuation.",
    "- An article can appear in both a top story and a swimlane; that's fine.",
    "- An article can be in at most one swimlane.",
    "",
    "Articles (each line: id, source, folder, publish date, title, optional summary):",
    ...lines,
    "",
    'Respond with ONLY valid JSON in this shape: {"topStories":[{"headline":"...","blurb":"...","articleIds":["..."]}],"swimlanes":[{"title":"...","description":"optional","articleIds":["..."]}]}.',
  ].join("\n");
}

function countDistinctFolders(
  articles: Article[],
  feedById: Map<string, Feed>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const a of articles) {
    const feed = feedById.get(a.feedId);
    const folder = feed?.folderId ?? "";
    const label = folder ? folder : UNFILED_LABEL;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return counts;
}

function listFolders(folderCount: Map<string, number>): string {
  if (folderCount.size === 0) return UNFILED_LABEL;
  return Array.from(folderCount.entries())
    .map(([id, n]) => `${id === UNFILED_LABEL ? UNFILED_LABEL : id} (${n})`)
    .join(", ");
}

function friendlyStatusError(status: number): string {
  if (status === 401 || status === 403) return "Check your Anthropic API key in Settings";
  if (status === 429) return "Anthropic is rate-limiting — try again in a minute";
  if (status >= 500) return "Anthropic is having trouble — try again shortly";
  return `Anthropic returned ${status}`;
}

interface AnthropicTextBlock {
  type: string;
  text?: string;
}

function extractTextBlock(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const content = (body as { content?: AnthropicTextBlock[] }).content;
  if (!Array.isArray(content)) return null;
  for (const block of content) {
    if (block?.type === "text" && typeof block.text === "string") return block.text;
  }
  return null;
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function extractTopStories(
  payload: Record<string, unknown>,
  knownIds: Set<string>,
): FrontpageStory[] {
  const raw = payload.topStories;
  if (!Array.isArray(raw)) return [];
  const out: FrontpageStory[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const headline = typeof e.headline === "string" ? e.headline.trim() : "";
    const blurb = typeof e.blurb === "string" ? e.blurb.trim() : "";
    const ids = Array.isArray(e.articleIds)
      ? (e.articleIds as unknown[])
          .filter((x): x is string => typeof x === "string")
          .filter((x) => knownIds.has(x))
      : [];
    if (!headline || !blurb || ids.length === 0) continue;
    out.push({ headline, blurb, articleIds: ids });
  }
  return out;
}

function extractSwimlanes(
  payload: Record<string, unknown>,
  knownIds: Set<string>,
): Swimlane[] {
  const raw = payload.swimlanes;
  if (!Array.isArray(raw)) return [];
  const out: Swimlane[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const title = typeof e.title === "string" ? e.title.trim() : "";
    const description = typeof e.description === "string" ? e.description.trim() : undefined;
    const ids = Array.isArray(e.articleIds)
      ? (e.articleIds as unknown[])
          .filter((x): x is string => typeof x === "string")
          .filter((x) => knownIds.has(x))
      : [];
    if (!title || ids.length === 0) continue;
    out.push(description ? { title, description, articleIds: ids } : { title, articleIds: ids });
  }
  return out;
}

function formatPromptDate(timestamp: number): string {
  if (!timestamp || Number.isNaN(timestamp)) return "unknown";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

function stripHtml(text: string): string {
  return text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
