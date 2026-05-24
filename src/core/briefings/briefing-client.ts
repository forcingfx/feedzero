/**
 * Thin client over @anthropic-ai/sdk for Signal Briefings.
 *
 * Browser-direct (the user supplies their own key via Settings), so we
 * pass `dangerouslyAllowBrowser: true`. The FeedZero server never sees
 * the prompt, the articles, or the resulting briefing — the only network
 * call is from the user's browser straight to `api.anthropic.com`,
 * authenticated with the key the user supplied. See ADR 019.
 *
 * Structured output via tool-use: we declare a single `submit_briefing`
 * tool and force it with `tool_choice`. This is sturdier than asking
 * the model to emit JSON and parsing free text — the SDK validates the
 * tool input against our `input_schema` before it gets back to us, and
 * we defensively re-check shape here in case a future model returns
 * something the SDK accepted but we can't render.
 *
 * The system prompt enforces: only cite articles from the provided
 * corpus, never invent facts, refuse to confabulate if the corpus
 * doesn't support the briefing prompt. Citations carry both the article
 * id (so the UI can deep-link to the reader) and a short quote (so the
 * citations sidebar has supporting evidence visible without an extra
 * fetch).
 *
 * Errors are mapped to friendly `Result.err` strings so the UI can
 * render specific guidance — "your key is invalid, paste a new one in
 * Settings" reads better than the raw SDK stacktrace.
 */

// NOTE: @anthropic-ai/sdk is dynamically imported inside generateBriefing
// so the ~500KB vendor bundle never loads on app boot — only when the
// user actually clicks Refresh on a briefing. Static-importing pulls in
// the SDK's optional `tools/agent-toolset/*` submodules that reach for
// `node:fs/promises`, `node:readline`, etc.; Vite externalises those for
// browser compatibility but the externalised stubs blow up the app at
// boot once the chunk actually loads.
//
// We deliberately do NOT static-import the SDK error classes either —
// resolving them eagerly defeats the lazy split. Errors come back as
// real instances of the SDK's classes; we match on `name` + status to
// dispatch to friendly messages without needing instanceof.
import type { Article, BriefingReport } from "@feedzero/core/types";
import { BRIEFING_REPORT_SCHEMA_VERSION } from "@feedzero/core/utils/constants";
import { err, ok } from "../../../packages/core/src/utils/result";
import type { Result } from "../../../packages/core/src/utils/result";
import type { BriefingModelId } from "./models";

const SUGGESTED_FEED_CAP = 5;
const MAX_TOKENS = 4096;
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
  "You are a research briefer producing concise, evidence-grounded briefings",
  "for B2B professionals (legal, policy, competitive intelligence, industry monitoring).",
  "",
  "Strict rules:",
  "1. Use ONLY the articles provided in the user message. Never invent facts,",
  "   never cite sources not in the corpus, never extrapolate beyond what the",
  "   articles support.",
  "2. If the corpus does not support a confident briefing on the user's prompt,",
  "   say so plainly in the abstract — do not pad with speculation. A short",
  "   honest abstract is more useful than a long confabulated one.",
  "3. Cite every material claim inline using [A1], [A2], etc., where the index",
  "   matches the article number shown in the corpus list.",
  "4. Keep the abstract concise: 2–4 short paragraphs of markdown. No headings",
  "   unless the briefing genuinely needs them.",
  "5. Suggest up to 5 feed URLs or sites that could strengthen the briefing.",
  "   Prefer authoritative primary sources. Do NOT suggest sources already in",
  "   the user's corpus (you'll see the source URLs in each article block).",
  "   For each suggestion, give one short sentence of rationale.",
  "6. Submit your entire output via the submit_briefing tool. Do not produce",
  "   any free text outside the tool call.",
].join("\n");

const SUBMIT_BRIEFING_TOOL = {
  name: "submit_briefing",
  description: "Submit the briefing as structured JSON.",
  input_schema: {
    type: "object" as const,
    properties: {
      abstract: {
        type: "string",
        description:
          "Markdown abstract, 2–4 short paragraphs. Cite articles inline as [A1], [A2], etc., where the index matches the article number in the corpus.",
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

/**
 * Call Claude to produce a briefing for `prompt` against `articles`.
 * The articles are the corpus the model is allowed to draw from — the
 * matcher already pre-filtered them down to the top-K most relevant.
 */
export async function generateBriefing(
  input: GenerateBriefingInput,
): Promise<Result<BriefingReport>> {
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch (e) {
    return err(
      `Couldn't load the Anthropic SDK: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const client = new Anthropic({
    apiKey: input.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const corpusText = renderCorpus(input.articles);
  const userMessage = [
    `Briefing prompt: ${input.prompt}`,
    "",
    "Corpus:",
    corpusText,
  ].join("\n");

  let response;
  try {
    response = await client.messages.create(
      {
        model: input.modelId,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        tools: [SUBMIT_BRIEFING_TOOL],
        tool_choice: { type: "tool", name: "submit_briefing" },
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: userMessage }],
          },
        ],
      },
      { signal: input.signal },
    );
  } catch (e) {
    return err(mapSdkError(e));
  }

  const toolBlock = (response.content ?? []).find(
    (block: { type: string }) => block.type === "tool_use",
  ) as { type: "tool_use"; input: unknown } | undefined;

  if (!toolBlock) {
    return err(
      "The model did not produce a structured briefing. Try refreshing again or switching to a different model.",
    );
  }

  const validated = validateToolPayload(toolBlock.input);
  if (!validated.ok) return validated;

  const matchedArticleIds = input.articles.map((a) => a.id);
  const usage = response.usage ?? { input_tokens: 0, output_tokens: 0 };

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
    tokenUsage: { input: usage.input_tokens, output: usage.output_tokens },
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

/**
 * Map an SDK error to a one-line message the UI can render verbatim.
 *
 * We dispatch on `error.name` + `error.status` rather than `instanceof`
 * because the SDK is dynamic-imported — keeping the static-import-only
 * error classes for instanceof checks would re-eagerly pull the SDK
 * back into the boot bundle and defeat the lazy split. The SDK gives
 * every error class a stable `name`, and HTTP-derived errors carry an
 * HTTP `status`, so name/status matching is just as reliable as
 * instanceof here.
 */
function mapSdkError(e: unknown): string {
  if (!(e instanceof Error)) return `Briefing failed: ${String(e)}`;

  const name = e.name;
  const rawStatus = (e as unknown as { status?: unknown }).status;
  const status = typeof rawStatus === "number" ? rawStatus : undefined;

  if (name === "APIUserAbortError" || (e as { type?: string }).type === "abort") {
    return "Briefing refresh cancelled.";
  }
  if (name === "AuthenticationError" || status === 401) {
    return "Anthropic rejected the API key. Paste a fresh key in Settings — invalid or revoked keys can't generate briefings.";
  }
  if (name === "RateLimitError" || status === 429) {
    return "Anthropic rate limit hit. Wait a minute and try again, or upgrade your Anthropic plan.";
  }
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") {
    return "Couldn't reach Anthropic. Check your network and try again.";
  }
  return `Briefing failed: ${e.message}`;
}
