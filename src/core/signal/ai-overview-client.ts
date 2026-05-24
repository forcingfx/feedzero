/**
 * AI-powered Signal overview.
 *
 * Routes through `/api/briefing` (the same Anthropic relay used by
 * Signal Briefings) — the relay is a generic Anthropic Messages
 * proxy, not briefing-specific. Reusing it means no new endpoint, no
 * new privacy surface, no new tests for the proxy contract.
 *
 * What this asks Claude to do, in one tool call:
 *  - Read a corpus of recent articles (top-K by recency from the
 *    in-window slice; same shape the ML engine works on).
 *  - Produce 5-10 cross-feed topics. Each topic has a short display
 *    name, a one-line summary, and the article ids that belong to it.
 *  - Skip topics that only appear in one source.
 *
 * The output is shaped exactly like the ML SignalReport so the
 * existing TopicSection / StoryRow rendering doesn't have to fork.
 * Per-topic prose summaries are returned separately and indexed by
 * topic term — the AI surface can render them as subtitles without
 * polluting the shared Topic interface.
 *
 * Cost: meaningful. A 200-article corpus with Sonnet runs roughly
 * 30-50K input tokens — call it 5-10 cents/run. The toggle is off by
 * default and the auto-refresh fires at most once per 24h to keep
 * surprise bills out of the picture; the UI surfaces estimated cost
 * before the first refresh.
 */

import type { Article } from "@feedzero/core/types";
import {
  SIGNAL_REPORT_SCHEMA_VERSION,
  SIGNAL_TOPIC_TARGET,
  SIGNAL_TOPIC_STORE_CAP,
  type AISignalReport,
  type Story,
  type Topic,
  type WindowChoice,
} from "./types";
import { err, ok } from "@feedzero/core/utils/result";
import type { Result } from "@feedzero/core/utils/result";
import type { BriefingModelId } from "../briefings/models";

const RELAY_URL = "/api/briefing";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;
const ARTICLE_EXCERPT_CHARS = 600;
const MAX_CORPUS = 150;

export interface GenerateAIOverviewInput {
  articles: Article[];
  window: WindowChoice;
  apiKey: string;
  modelId: BriefingModelId;
  signal?: AbortSignal;
  /** Override "now" for tests. */
  now?: number;
}

const SYSTEM_PROMPT = [
  "You are an editorial topic clusterer for a privacy-first RSS reader.",
  "Given the user's recent articles, identify 5-10 cross-feed topics that",
  "describe what's happening right now across the user's sources.",
  "",
  "Rules:",
  "1. A topic MUST contain articles from at least 2 distinct feeds. If",
  "   you can't find at least two outlets converging on a topic, skip",
  "   it — single-feed bursts aren't 'signal'.",
  "2. Topic names are short (2-5 words), title-cased, and concrete.",
  "   Prefer named entities (\"EU AI Act\", \"OpenAI Outage\") over abstract",
  "   themes (\"AI News\", \"Technology Updates\").",
  "3. Each topic gets a one-line summary (≤ 20 words) describing what's",
  "   actually happening — not a label, a sentence.",
  "4. Reference articles by the `id` field shown in the corpus, not by",
  "   title or index. Each article id must appear in AT MOST one topic.",
  "5. Order topics by recency (newest first), not by article count.",
  "6. Submit your entire output via the submit_signal_overview tool.",
  "   Do not produce any free text outside the tool call.",
].join("\n");

const SUBMIT_OVERVIEW_TOOL = {
  name: "submit_signal_overview",
  description: "Submit the Signal overview as structured JSON.",
  input_schema: {
    type: "object" as const,
    properties: {
      topics: {
        type: "array",
        description:
          "5-10 cross-feed topics describing what's happening right now.",
        maxItems: SIGNAL_TOPIC_TARGET,
        items: {
          type: "object",
          properties: {
            displayName: {
              type: "string",
              description:
                "Short concrete name (2-5 words, title case). Prefer named entities over abstract themes.",
            },
            summary: {
              type: "string",
              description:
                "One-line summary (≤20 words) of what's happening in this topic. A sentence, not a label.",
            },
            articleIds: {
              type: "array",
              description:
                "Article ids that belong to this topic. Each id from the corpus appears in AT MOST one topic across the full list.",
              items: { type: "string" },
            },
          },
          required: ["displayName", "summary", "articleIds"],
        },
      },
    },
    required: ["topics"],
  },
};

interface AIToolPayload {
  topics: Array<{
    displayName: string;
    summary: string;
    articleIds: string[];
  }>;
}

interface AnthropicResponse {
  content?: Array<{ type: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function generateAIOverview(
  input: GenerateAIOverviewInput,
): Promise<Result<AISignalReport>> {
  // Top-K by recency. The corpus cap keeps the request inside reasonable
  // token budgets — a 200-article corpus at full text would push 100K
  // input tokens easily.
  const sorted = [...input.articles].sort(
    (a, b) => b.publishedAt - a.publishedAt,
  );
  const corpus = sorted.slice(0, MAX_CORPUS);

  if (corpus.length === 0) {
    return err("No articles in window — try a wider date range.");
  }

  const corpusText = renderCorpus(corpus);
  const userMessage = [
    "Recent articles across the user's feeds:",
    "",
    corpusText,
    "",
    "Identify the cross-feed topics. Submit via submit_signal_overview.",
  ].join("\n");

  const requestBody = {
    model: input.modelId,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_OVERVIEW_TOOL],
    tool_choice: { type: "tool", name: "submit_signal_overview" },
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: userMessage }],
      },
    ],
  };

  let response: Response;
  try {
    response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": input.apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify(requestBody),
      signal: input.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      return err("AI Signal cancelled.");
    }
    const msg = e instanceof Error ? e.message : String(e);
    return err(`Couldn't reach the briefing relay: ${msg}`);
  }

  if (!response.ok) {
    return err(await mapHttpError(response));
  }

  let parsed: AnthropicResponse;
  try {
    parsed = (await response.json()) as AnthropicResponse;
  } catch {
    return err("AI Signal: unparseable response from Anthropic.");
  }

  const toolBlock = (parsed.content ?? []).find(
    (b) => b.type === "tool_use",
  );
  if (!toolBlock) {
    return err("The model did not produce a structured overview.");
  }

  const validated = validatePayload(toolBlock.input);
  if (!validated.ok) return validated;

  const articleById = new Map(input.articles.map((a) => [a.id, a]));
  const topics = buildTopics(validated.value, articleById);

  if (topics.length === 0) {
    return err(
      "AI Signal: the model didn't produce any usable topics. Try refreshing or switching back to the ML view.",
    );
  }

  const summaries: Record<string, string> = {};
  for (const t of validated.value.topics) {
    summaries[t.displayName] = t.summary;
  }

  const usage = parsed.usage ?? {};
  const now = input.now ?? Date.now();
  const feedsInWindow = new Set(corpus.map((a) => a.feedId)).size;

  return ok({
    schemaVersion: SIGNAL_REPORT_SCHEMA_VERSION,
    topics,
    window: input.window,
    corpusSize: input.articles.length,
    corpusInWindow: corpus.length,
    feedsInWindow,
    generatedAt: now,
    source: "ai",
    summaries,
    modelId: input.modelId,
    tokenUsage: {
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
    },
  });
}

function renderCorpus(articles: Article[]): string {
  return articles
    .map((a) => {
      const body = stripTags(a.summary || a.content);
      const excerpt = body.slice(0, ARTICLE_EXCERPT_CHARS);
      return [
        `--- id: ${a.id} ---`,
        `feed: ${a.feedId}`,
        `title: ${a.title}`,
        excerpt ? `excerpt: ${excerpt}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function validatePayload(input: unknown): Result<AIToolPayload> {
  if (!input || typeof input !== "object") {
    return err("AI Signal: tool input was not an object.");
  }
  const obj = input as Record<string, unknown>;
  if (!Array.isArray(obj.topics)) {
    return err("AI Signal: missing topics array.");
  }
  const topics: AIToolPayload["topics"] = [];
  for (const t of obj.topics) {
    if (!t || typeof t !== "object") continue;
    const r = t as Record<string, unknown>;
    if (typeof r.displayName !== "string") continue;
    if (typeof r.summary !== "string") continue;
    if (!Array.isArray(r.articleIds)) continue;
    const articleIds = r.articleIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (articleIds.length === 0) continue;
    topics.push({
      displayName: r.displayName,
      summary: r.summary,
      articleIds,
    });
  }
  return ok({ topics });
}

/**
 * Map model-returned topics into the SignalReport.Topic shape so the
 * existing UI works unchanged. Filters out topics whose article ids
 * either don't resolve or all come from a single feed (rule #1 in the
 * system prompt — defense in depth in case the model ignores it).
 */
function buildTopics(
  payload: AIToolPayload,
  articleById: Map<string, Article>,
): Topic[] {
  const claimed = new Set<string>();
  const built: Topic[] = [];

  for (const candidate of payload.topics) {
    const articles = candidate.articleIds
      .filter((id) => !claimed.has(id))
      .map((id) => articleById.get(id))
      .filter((a): a is Article => a !== undefined);
    if (articles.length < 2) continue;

    const feedIds = new Set(articles.map((a) => a.feedId));
    if (feedIds.size < 2) continue;

    // Newest first.
    articles.sort((a, b) => b.publishedAt - a.publishedAt);
    for (const a of articles) claimed.add(a.id);

    // One story per article — AI mode doesn't try to dedupe stories
    // (the frequency engine's stories step is for fingerprint clustering
    // of near-duplicate headlines; Claude is already doing that
    // implicitly by name).
    const stories: Story[] = articles.slice(0, SIGNAL_TOPIC_STORE_CAP).map((a) => ({
      id: a.id,
      title: a.title,
      articleIds: [a.id],
      feedCount: 1,
    }));

    const newestActivityAt = Math.max(...articles.map((a) => a.publishedAt));
    const term = candidate.displayName.toLowerCase().trim();

    built.push({
      term,
      displayTerm: candidate.displayName,
      stories,
      totalStories: articles.length,
      totalArticlesInCluster: articles.length,
      feedCount: feedIds.size,
      newestActivityAt,
    });
  }

  built.sort(
    (a, b) =>
      b.newestActivityAt - a.newestActivityAt ||
      (a.displayTerm < b.displayTerm
        ? -1
        : a.displayTerm > b.displayTerm
          ? 1
          : 0),
  );

  return built;
}

async function mapHttpError(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Anthropic rejected the API key. Paste a fresh key in Settings.";
  }
  if (response.status === 429) {
    const retry = response.headers.get("retry-after");
    return retry
      ? `Anthropic rate limit hit. Try again in ${retry}s.`
      : "Anthropic rate limit hit. Wait a minute and try again.";
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return "Couldn't reach Anthropic. Check your network or try again in a minute.";
  }
  return `AI Signal failed (HTTP ${response.status}).`;
}
