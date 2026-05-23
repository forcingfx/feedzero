/**
 * Named-entity extraction for the Signal frequency engine.
 *
 * Pure functions, deterministic, no ML. The engine clusters strictly
 * around proper nouns and compound nouns ("Iran War", "Supreme Court").
 * Detection rests on capitalization consensus across the corpus rather
 * than part-of-speech tagging:
 *
 *  - A single word is a proper noun if, across the whole corpus, it is
 *    capitalized in a high share of its NON-INITIAL occurrences (mid
 *    sentence, where capitalization is meaningful) — or, when it only
 *    ever appears sentence-initial, if it is never seen lowercase.
 *  - A compound is a contiguous run of capitalized words (allowing a few
 *    connector words like "of"), taken only from sentence-case context or
 *    from runs of already-confirmed proper nouns. This avoids turning a
 *    Title-Cased headline into one giant bogus entity.
 *
 * The casing evidence comes from sentence-case text. Title-Cased headlines
 * (most words capitalized) carry no casing signal and are excluded from the
 * consensus tally.
 */

import { stripHtml, STOPWORDS } from "./tokenize.ts";
import { PROPER_NOUN_RATIO } from "./types.ts";
import type { Article } from "../../../packages/core/src/types";

/** Lowercase connector words allowed to sit inside a compound entity. */
const CONNECTORS = new Set([
  "of", "and", "the", "for", "de", "von", "van", "da", "del", "al", "la", "le",
]);

/** Max significant words kept in a compound key. */
const MAX_PHRASE_WORDS = 3;

/** Fraction of alpha words capitalized above which a title is "Title Cased". */
const TITLE_CASE_THRESHOLD = 0.6;

const WORD_SPLIT = /\s+/;
const ALPHA = /\p{L}/u;
const SENTENCE_BREAK = /(?<=[.!?])\s+/u;

export interface EntityLexicon {
  /** lowercased word → most common original casing, for confirmed proper nouns. */
  properNouns: Map<string, string>;
}

export interface EntityOccurrence {
  /** Lowercased, normalized phrase used as the cluster key. */
  key: string;
  /** Original casing as seen, used for display. */
  display: string;
  /** Significant (non-connector) word count — drives the phrase boost. */
  words: number;
}

interface CasingTally {
  nonInitialCap: number;
  nonInitialLower: number;
  totalLower: number;
  totalCap: number;
  articleIds: Set<string>;
  /** Histogram of original casings, for picking a display form. */
  casings: Map<string, number>;
}

/**
 * Build the proper-noun lexicon from corpus-wide casing consensus. Pass
 * the representative articles (one per syndicated story) so a wire story
 * running across many feeds doesn't dominate the tally.
 */
export function buildLexicon(articles: Article[]): EntityLexicon {
  const tally = new Map<string, CasingTally>();

  for (const article of articles) {
    for (const segment of segments(article)) {
      // A Title-Cased segment capitalizes everything, so its casing is
      // worthless as proper-noun evidence — skip it entirely.
      if (isTitleCased(segment.words)) continue;
      segment.words.forEach((word, i) => {
        const norm = normalizeWord(word);
        if (!norm) return;
        let t = tally.get(norm);
        if (!t) {
          t = {
            nonInitialCap: 0,
            nonInitialLower: 0,
            totalLower: 0,
            totalCap: 0,
            articleIds: new Set(),
            casings: new Map(),
          };
          tally.set(norm, t);
        }
        t.articleIds.add(article.id);
        const cap = isCapitalized(word);
        if (cap) {
          t.totalCap += 1;
          t.casings.set(word, (t.casings.get(word) ?? 0) + 1);
        } else {
          t.totalLower += 1;
        }
        if (i > 0) {
          if (cap) t.nonInitialCap += 1;
          else t.nonInitialLower += 1;
        }
      });
    }
  }

  const properNouns = new Map<string, string>();
  for (const [norm, t] of tally) {
    if (t.articleIds.size < 2) continue;
    if (STOPWORDS.has(norm) || norm.length < 3) continue;
    if (isProperNoun(t)) {
      properNouns.set(norm, pickCasing(t.casings, norm));
    }
  }
  return { properNouns };
}

function isProperNoun(t: CasingTally): boolean {
  const nonInitial = t.nonInitialCap + t.nonInitialLower;
  if (nonInitial > 0) {
    return t.nonInitialCap / nonInitial >= PROPER_NOUN_RATIO;
  }
  // Only ever seen sentence-initial: trust it only if never lowercase.
  return t.totalLower === 0 && t.totalCap >= 2;
}

/**
 * Extract entity occurrences (proper nouns + compounds) from an article.
 * Duplicate keys may repeat across mentions; the caller dedupes per
 * article for counting while accumulating display casings.
 */
export function extractEntities(article: Article, lexicon: EntityLexicon): EntityOccurrence[] {
  const out: EntityOccurrence[] = [];
  for (const segment of segments(article)) {
    const titleCased = isTitleCased(segment.words);
    collectFromSegment(segment.words, lexicon, titleCased, out);
  }
  return out;
}

function collectFromSegment(
  words: string[],
  lexicon: EntityLexicon,
  titleCased: boolean,
  out: EntityOccurrence[],
): void {
  let run: { display: string; norm: string }[] = [];

  const flush = () => {
    const significant = run.filter((w) => !CONNECTORS.has(w.norm));
    if (significant.length === 0) {
      run = [];
      return;
    }
    // Unigram entities: only confirmed proper nouns (kills sentence-initial
    // and Title-Case false positives like "Breaking" / "The").
    for (const w of significant) {
      if (lexicon.properNouns.has(w.norm)) {
        out.push({ key: w.norm, display: lexicon.properNouns.get(w.norm)!, words: 1 });
      }
    }
    // Compound entity: trim connectors from the ends, keep up to N words.
    if (significant.length >= 2) {
      const trimmed = trimConnectors(run);
      const sig = trimmed.filter((w) => !CONNECTORS.has(w.norm));
      if (sig.length >= 2 && sig.length <= MAX_PHRASE_WORDS) {
        const eligible = titleCased
          ? sig.every((w) => lexicon.properNouns.has(w.norm))
          : true;
        if (eligible) {
          out.push({
            key: trimmed.map((w) => w.norm).join(" "),
            display: trimmed.map((w) => w.display).join(" "),
            words: sig.length,
          });
        }
      }
    }
    run = [];
  };

  words.forEach((word, i) => {
    const norm = normalizeWord(word);
    if (!norm) {
      flush();
      return;
    }
    const isInitial = i === 0;
    const cap = isCapitalized(word);
    const connector = CONNECTORS.has(norm) && run.length > 0;
    // A capitalized, non-initial word extends a run; a confirmed proper
    // noun extends it even sentence-initially; a connector bridges a gap.
    const extends_ =
      (cap && !isInitial) || lexicon.properNouns.has(norm) || connector;
    if (extends_) {
      run.push({ display: word, norm });
    } else {
      flush();
    }
  });
  flush();
}

function trimConnectors(run: { display: string; norm: string }[]): { display: string; norm: string }[] {
  let start = 0;
  let end = run.length;
  while (start < end && CONNECTORS.has(run[start].norm)) start += 1;
  while (end > start && CONNECTORS.has(run[end - 1].norm)) end -= 1;
  return run.slice(start, end);
}

interface Segment {
  words: string[];
}

function segments(article: Article): Segment[] {
  const out: Segment[] = [];
  const title = stripHtml(article.title || "").trim();
  if (title) out.push({ words: title.split(WORD_SPLIT) });
  const body = stripHtml(article.content || article.summary || "").trim();
  if (body) {
    for (const sentence of body.split(SENTENCE_BREAK)) {
      const words = sentence.trim().split(WORD_SPLIT).filter(Boolean);
      if (words.length) out.push({ words });
    }
  }
  return out;
}

function isTitleCased(words: string[]): boolean {
  const alpha = words.filter((w) => ALPHA.test(w));
  // Below 4 words the capitalized share is an unreliable Title-Case signal:
  // an entity-dense sentence-case headline ("OpenAI launches Atlas") would
  // trip a lower bar and lose its proper nouns. Require enough words first.
  if (alpha.length < 4) return false;
  const capped = alpha.filter((w) => isCapitalized(w)).length;
  return capped / alpha.length >= TITLE_CASE_THRESHOLD;
}

function isCapitalized(word: string): boolean {
  const first = firstAlpha(word);
  return first !== null && first === first.toUpperCase() && first !== first.toLowerCase();
}

function firstAlpha(word: string): string | null {
  for (const ch of word) {
    if (ALPHA.test(ch)) return ch;
  }
  return null;
}

/** Lowercase, strip surrounding punctuation and a trailing possessive. */
function normalizeWord(word: string): string {
  const lower = word.toLowerCase().replace(/[’']s$/u, "");
  const cleaned = lower.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (!ALPHA.test(cleaned)) return "";
  return cleaned;
}

function pickCasing(casings: Map<string, number>, fallback: string): string {
  let best = fallback;
  let bestCount = -1;
  for (const [casing, count] of casings) {
    const clean = casing.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (count > bestCount || (count === bestCount && clean < best)) {
      best = clean;
      bestCount = count;
    }
  }
  return best;
}
