/**
 * Browser client for Signal Briefings.
 *
 * Routes through `/api/briefing` — a same-origin relay that forwards
 * the request to `api.anthropic.com/v1/messages` with the user's own
 * key. This used to be a direct call from the browser to Anthropic
 * (BYO key, never touched the server), but iOS Safari + every other
 * WebKit browser blocked the cross-origin response, so the feature
 * was unreachable on iPad/iPhone. The relay restores reach at the
 * cost of letting the API key + payload transit the FeedZero server
 * per refresh; the relay doesn't log or persist either. See ADR 024
 * for the full reasoning.
 *
 * We no longer depend on `@anthropic-ai/sdk` — the relay is a dumb
 * pipe and the request/response shapes are stable across SDK
 * versions. Hand-building the body is ~20 lines and shaves ~130KB
 * gzip off the bundle.
 *
 * Structured output via tool-use: a single `submit_briefing` tool
 * forced via `tool_choice`. System prompt enforces: only cite
 * articles from the provided corpus, never invent facts, refuse to
 * confabulate if the corpus doesn't support the briefing prompt.
 *
 * Errors are mapped to friendly Result.err strings so the UI can
 * render specific guidance — "your key is invalid, paste a fresh
 * one" reads better than the raw HTTP status.
 */

import type { Article, BriefingReport } from "@feedzero/core/types";
import { BRIEFING_REPORT_SCHEMA_VERSION } from "@feedzero/core/utils/constants";
import { err, ok } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import type { BriefingModelId } from "./models";

const RELAY_URL = "/api/briefing";
const ANTHROPIC_VERSION = "2023-06-01";
const SUGGESTED_FEED_CAP = 5;
// Bumped from 4096 because web_search results inflate the running
// context — the model needs room to issue several searches and still
// produce the structured briefing.
const MAX_TOKENS = 8192;
const WEB_SEARCH_MAX_USES = 5;
/** How much of each article body to send. Long enough for context, short enough to control cost. */
const ARTICLE_EXCERPT_CHARS = 1500;

export interface GenerateBriefingInput {
  prompt: string;
  /** Pre-matched corpus (top-K from prompt-matcher). */
  articles: Article[];
  apiKey: string;
  modelId: BriefingModelId;
  /** Optional cancellation. */
  signal?: AbortSignal;
}

const SYSTEM_PROMPT = [
  "You are a research briefer producing executive briefings for B2B",
  "professionals (legal, policy, competitive intelligence, industry",
  "monitoring). Your output is read fast and scanned for patterns —",
  "structure matters as much as substance.",
  "",
  "Output format (REQUIRED):",
  "",
  "  ## Key takeaways",
  "  - Three to five bullet points. Each ≤ 2 sentences. Bold the **subject",
  "    or actor** in each bullet so the reader can scan owners at a",
  "    glance. Cite inline as [A1], [A2], etc.",
  "",
  "  ## What's happening",
  "  Two to four short paragraphs (≤ 3 sentences each). Use **bold** for",
  "  the names, jurisdictions, dates, or quantities that anchor each",
  "  claim. Cite every claim. Group related developments into the same",
  "  paragraph; don't write one paragraph per article.",
  "",
  "  ## What to watch",
  "  Two or three bullets. Forward-looking only — what to expect or",
  "  monitor next, drawn directly from signals in the corpus. Cite the",
  "  article that motivates each watch item. Do NOT invent timelines or",
  "  speculate beyond what the articles support.",
  "",
  "Strict rules:",
  "1. Use ONLY the articles provided in the user message. Never invent",
  "   facts, never cite sources not in the corpus, never extrapolate",
  "   beyond what the articles support.",
  "2. If the corpus does not support a confident briefing on the user's",
  "   prompt, say so plainly under \"## Key takeaways\" — do not pad with",
  "   speculation. A short honest briefing is more useful than a long",
  "   confabulated one. Omit \"## What to watch\" if you have nothing real",
  "   to put there.",
  "3. Cite every material claim inline using [A1], [A2], etc., where the",
  "   index matches the article number shown in the corpus list. Every",
  "   citation index you use MUST appear in the citations array you",
  "   submit; every entry in the citations array MUST be referenced at",
  "   least once in the abstract.",
  "4. Use markdown headings (## level 2 only — no h1, no h3+), bullets",
  "   (`-`), and **bold** as specified above. Do not use blockquotes,",
  "   tables, code blocks, or images — none of those render in the",
  "   briefing surface.",
  "5. Suggest up to 5 RSS / Atom feed URLs that could strengthen the",
  "   briefing — but you MUST verify each one is real and currently",
  "   active before suggesting it. Use the web_search tool to find",
  "   candidate sources (search queries like `<topic> RSS feed site:`",
  "   or `<publisher> Atom URL` work well), then verify each candidate",
  "   feed URL with a second targeted search if needed. Do NOT suggest",
  "   any URL you haven't surfaced via web_search; do NOT guess feed",
  "   paths like `/feed` or `/rss` from a model-known site name —",
  "   those guesses are wrong as often as they're right. Prefer",
  "   authoritative primary sources. Do NOT suggest sources already in",
  "   the user's corpus (you'll see the source URLs in each article",
  "   block). For each suggestion, give one short sentence of rationale.",
  "   If web_search returns nothing usable for a particular topic, return",
  "   FEWER suggestions rather than padding with unverified guesses.",
  "6. Submit your entire output via the submit_briefing tool. Do not",
  "   produce any free text outside the tool call.",
].join("\n");

/**
 * Anthropic's server-side web search. The model issues queries, the
 * Anthropic backend runs them, and the model receives the results
 * inline — no client-side fetches, no SSRF concerns, no roundtrips
 * through our relay beyond the initial request.
 *
 * `max_uses` caps how many searches the model can run on a single
 * request; we set it to 5 (covers a few rounds of "find a publisher"
 * + "verify each candidate feed URL"). Costs ~1¢/search at Anthropic's
 * current rates, paid by the user since they brought their own key.
 */
const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: WEB_SEARCH_MAX_USES,
} as const;

const SUBMIT_BRIEFING_TOOL = {
  name: "submit_briefing",
  description: "Submit the briefing as structured JSON.",
  input_schema: {
    type: "object" as const,
    properties: {
      abstract: {
        type: "string",
        description:
          "Markdown briefing. MUST contain three sections in this order: `## Key takeaways` (3-5 bullets, each ≤2 sentences, bold the subject/actor), `## What's happening` (2-4 short paragraphs, bold the names/jurisdictions/dates/quantities), `## What to watch` (2-3 forward-looking bullets — omit the section entirely if nothing real to put there). Cite every material claim inline as [A1], [A2], etc.",
      },
      citations: {
        type: "array",
        description:
          "Citations referenced by the abstract, in the order they appear. [A1] in the abstract maps to citations[0].",
        items: {
          type: "object",
          properties: {
            articleId: {
              type: "string",
              description:
                "The article's id (UUID) exactly as shown in the corpus.",
            },
            quote: {
              type: "string",
              description:
                "Short paraphrase or excerpt supporting the cited claim (<=240 chars).",
            },
          },
          required: ["articleId", "quote"],
        },
      },
      suggestedFeeds: {
        type: "array",
        description:
          "Up to 5 feeds or sites the user could subscribe to that would strengthen this briefing. Do not include sources already in their corpus.",
        maxItems: SUGGESTED_FEED_CAP,
        items: {
          type: "object",
          properties: {
            candidateUrl: {
              type: "string",
              description:
                "Feed URL or site URL the user could try subscribing to.",
            },
            rationale: {
              type: "string",
              description:
                "One short sentence on why this source would strengthen the briefing.",
            },
          },
          required: ["candidateUrl", "rationale"],
        },
      },
    },
    required: ["abstract", "citations", "suggestedFeeds"],
  },
};

interface ToolPayload {
  abstract: string;
  citations: Array<{ articleId: string; quote: string }>;
  suggestedFeeds: Array<{ candidateUrl: string; rationale: string }>;
}

interface AnthropicResponse {
  content?: Array<{ type: string; name?: string; input?: unknown }>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

export async function generateBriefing(
  input: GenerateBriefingInput,
): Promise<Result<BriefingReport>> {
  const corpusText = renderCorpus(input.articles);
  const userMessage = [
    `Briefing prompt: ${input.prompt}`,
    "",
    "Corpus:",
    corpusText,
  ].join("\n");

  const requestBody = {
    model: input.modelId,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    tools: [WEB_SEARCH_TOOL, SUBMIT_BRIEFING_TOOL],
    // `auto` (not `{type: "tool", name: ...}`) so the model can run
    // web_search before submit_briefing. The system prompt requires
    // submit_briefing as the final step; if a model returns text
    // without it, validateToolPayload below surfaces a clear error.
    tool_choice: { type: "auto" },
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
    return err(mapFetchError(e));
  }

  if (!response.ok) {
    return err(await mapHttpError(response));
  }

  let parsed: AnthropicResponse;
  try {
    parsed = (await response.json()) as AnthropicResponse;
  } catch {
    return err(
      "Anthropic returned a response we couldn't parse as JSON. Try refreshing again.",
    );
  }

  // Multi-step responses (when web_search is enabled) interleave
  // `server_tool_use` blocks for the searches with text blocks for
  // model reasoning and a final `tool_use` block for submit_briefing.
  // Pick the submit_briefing call specifically — defaulting to the
  // first `tool_use` would still work today but breaks the moment
  // we add another client-side tool.
  const toolBlock = (parsed.content ?? []).find(
    (block) => block.type === "tool_use" && block.name === "submit_briefing",
  );
  if (!toolBlock) {
    return err(
      "The model did not produce a structured briefing. Try refreshing again or switching to a different model.",
    );
  }

  const validated = validateToolPayload(toolBlock.input);
  if (!validated.ok) return validated;

  const matchedArticleIds = input.articles.map((a) => a.id);
  const usage = parsed.usage ?? {};

  const report: BriefingReport = {
    schemaVersion: BRIEFING_REPORT_SCHEMA_VERSION,
    abstract: validated.value.abstract,
    citations: validated.value.citations.map((c) => ({
      articleId: c.articleId,
      quote: c.quote,
    })),
    signalScore: 0, // filled in by the service from the local matcher
    suggestedFeeds: validated.value.suggestedFeeds
      .slice(0, SUGGESTED_FEED_CAP)
      .map((s) => ({
        candidateUrl: s.candidateUrl,
        rationale: s.rationale,
        discoveryStatus: "pending" as const,
      })),
    matchedArticleIds,
    modelId: input.modelId,
    tokenUsage: {
      input: usage.input_tokens ?? 0,
      output: usage.output_tokens ?? 0,
    },
    generatedAt: Date.now(),
  };

  return ok(report);
}

/**
 * Render the article corpus into a numbered block the model can cite by
 * index. Each article carries its real id so the model can use it in
 * the citations array, and an excerpt capped at `ARTICLE_EXCERPT_CHARS`
 * so token cost stays predictable.
 */
function renderCorpus(articles: Article[]): string {
  return articles
    .map((article, i) => {
      const body = stripTags(article.summary || article.content);
      const excerpt = body.slice(0, ARTICLE_EXCERPT_CHARS);
      return [
        `=== Article A${i + 1} ===`,
        `id: ${article.id}`,
        `title: ${article.title}`,
        article.author ? `author: ${article.author}` : "",
        article.link ? `source: ${article.link}` : "",
        "",
        excerpt,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function validateToolPayload(input: unknown): Result<ToolPayload> {
  if (!input || typeof input !== "object") {
    return err("Briefing tool input was not an object.");
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.abstract !== "string" || obj.abstract.trim().length === 0) {
    return err("Briefing is missing an abstract.");
  }
  const citations = Array.isArray(obj.citations) ? obj.citations : [];
  const validatedCitations: ToolPayload["citations"] = [];
  for (const c of citations) {
    if (
      c &&
      typeof c === "object" &&
      typeof (c as Record<string, unknown>).articleId === "string" &&
      typeof (c as Record<string, unknown>).quote === "string"
    ) {
      validatedCitations.push({
        articleId: (c as { articleId: string }).articleId,
        quote: (c as { quote: string }).quote,
      });
    }
  }
  const suggestedRaw = Array.isArray(obj.suggestedFeeds)
    ? obj.suggestedFeeds
    : [];
  const validatedSuggested: ToolPayload["suggestedFeeds"] = [];
  for (const s of suggestedRaw) {
    if (
      s &&
      typeof s === "object" &&
      typeof (s as Record<string, unknown>).candidateUrl === "string" &&
      typeof (s as Record<string, unknown>).rationale === "string"
    ) {
      validatedSuggested.push({
        candidateUrl: (s as { candidateUrl: string }).candidateUrl,
        rationale: (s as { rationale: string }).rationale,
      });
    }
  }
  return ok({
    abstract: obj.abstract,
    citations: validatedCitations,
    suggestedFeeds: validatedSuggested,
  });
}

/** Network-layer error (fetch threw before getting a response). */
function mapFetchError(e: unknown): string {
  if (e instanceof Error && e.name === "AbortError") {
    return "Briefing refresh cancelled.";
  }
  const message = e instanceof Error ? e.message : String(e);
  return `Couldn't reach the briefing relay: ${message}`;
}

/**
 * HTTP error mapping. The relay forwards Anthropic's status verbatim,
 * so 401/429/etc. carry the same meaning as a direct call. Status takes
 * precedence over body shape because the body might be empty (Anthropic
 * 5xx) or non-JSON (relay 502 wrapped in its own JSON envelope).
 */
async function mapHttpError(response: Response): Promise<string> {
  if (response.status === 401) {
    return "Anthropic rejected the API key. Paste a fresh key in Settings — invalid or revoked keys can't generate briefings.";
  }
  if (response.status === 429) {
    const retryAfter = response.headers.get("retry-after");
    return retryAfter
      ? `Anthropic rate limit hit. Try again in ${retryAfter}s, or upgrade your Anthropic plan.`
      : "Anthropic rate limit hit. Wait a minute and try again, or upgrade your Anthropic plan.";
  }
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    // 502 from our relay (couldn't reach Anthropic) or 5xx from
    // Anthropic itself — same UX message either way.
    return "Couldn't reach Anthropic. Check your network or try again in a minute.";
  }
  // Try to pull an error message from the response body before falling back.
  let detail: string | undefined;
  try {
    const body = (await response.json()) as { error?: { message?: string } | string };
    if (typeof body.error === "string") {
      detail = body.error;
    } else if (body.error && typeof body.error.message === "string") {
      detail = body.error.message;
    }
  } catch {
    /* body wasn't JSON or empty — fall through */
  }
  return `Briefing failed (HTTP ${response.status})${detail ? `: ${detail}` : ""}.`;
}
