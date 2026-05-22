/**
 * Tokenization for the Signal frequency engine.
 *
 * Pure functions, deterministic, no DOM. Tokens are lowercased, light-stemmed,
 * and filtered against stopword + feed-noise lists. Numeric-only tokens and
 * tokens shorter than 3 characters are dropped.
 *
 * The stemmer is a 5-line suffix stripper, not Porter. Good enough for
 * cross-feed term overlap; not adequate for full IR. Non-English content
 * tokenizes poorly (the stopword list is English-only); the engine still
 * produces output, just lower-quality.
 */

const MIN_LEN = 3;
const NUMERIC = /^\d+$/;
const NON_WORD = /[^\p{L}\p{N}]+/u;

const STOPWORD_LIST = [
  "a", "about", "above", "after", "again", "against", "all", "am", "an", "and",
  "any", "are", "as", "at", "be", "because", "been", "before", "being", "below",
  "between", "both", "but", "by", "can", "could", "did", "do", "does", "doing",
  "don", "down", "during", "each", "few", "for", "from", "further", "had", "has",
  "have", "having", "he", "her", "here", "hers", "herself", "him", "himself",
  "his", "how", "if", "in", "into", "is", "it", "its", "itself", "just", "me",
  "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on",
  "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over",
  "own", "same", "she", "should", "so", "some", "such", "than", "that", "the",
  "their", "theirs", "them", "themselves", "then", "there", "these", "they",
  "this", "those", "through", "to", "too", "under", "until", "up", "very",
  "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
  "why", "will", "with", "would", "you", "your", "yours", "yourself", "yourselves",
  "also", "may", "might", "must", "shall", "even", "ever", "every", "much",
  "many", "still", "yet", "however", "though", "thus", "hence", "rather",
  "via", "per", "upon", "around", "across", "among", "behind", "beyond",
  "within", "without", "toward", "towards",
];

export const STOPWORDS: ReadonlySet<string> = new Set(STOPWORD_LIST);

export const FEED_NOISE: ReadonlySet<string> = new Set([
  "read", "more", "subscribe", "click", "comments", "share", "tweet", "email",
  "newsletter", "continue", "reading", "posted", "permalink", "rss", "feed",
  "appeared", "first", "originally", "published",
]);

/**
 * Strip a tiny set of trailing suffixes. Not Porter; intentionally
 * minimal so cross-language input degrades gracefully and the engine
 * stays under ~50 LOC. Tokens shorter than 4 chars are left alone so
 * "ing" / "ed" themselves don't get mangled.
 */
export function lightStem(token: string): string {
  if (token.length < 4) return token;
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("ing") && token.length > 5) return collapseDouble(token.slice(0, -3));
  if (token.endsWith("ed") && token.length > 4) return collapseDouble(token.slice(0, -2));
  if (token.endsWith("es") && token.length > 4) return token.slice(0, -2);
  if (token.endsWith("s") && !token.endsWith("ss") && token.length > 3) {
    return token.slice(0, -1);
  }
  return token;
}

/**
 * English suffix rules double the final consonant before -ing/-ed:
 * "run" → "running", "stop" → "stopped". After we strip the suffix we
 * collapse the duplicated consonant so the stem matches the lemma the
 * user would actually search for. Vowels are left alone (e.g. "seed"
 * shouldn't collapse to "sed").
 */
function collapseDouble(stem: string): string {
  if (stem.length < 4) return stem;
  const last = stem[stem.length - 1];
  const prev = stem[stem.length - 2];
  if (last === prev && /[bcdfghjklmnpqrstvwxz]/.test(last)) {
    return stem.slice(0, -1);
  }
  return stem;
}

/**
 * Tokenize a string of HTML or plain text into a flat list of normalized
 * terms. Duplicates are preserved so callers can count term frequency.
 */
export function tokenize(input: string): string[] {
  if (!input) return [];
  const plain = stripHtml(input).toLowerCase();
  if (!plain.trim()) return [];
  const raw = plain.split(NON_WORD);
  const out: string[] = [];
  for (const token of raw) {
    if (token.length < MIN_LEN) continue;
    if (NUMERIC.test(token)) continue;
    if (STOPWORDS.has(token)) continue;
    if (FEED_NOISE.has(token)) continue;
    const stem = lightStem(token);
    if (stem.length < MIN_LEN) continue;
    if (STOPWORDS.has(stem)) continue;
    if (FEED_NOISE.has(stem)) continue;
    out.push(stem);
  }
  return out;
}

/**
 * Strip HTML tags and entities, preserving original case. Shared with the
 * entity extractor, which needs casing intact to detect proper nouns.
 */
export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/&[a-z0-9#]+;/gi, " ");
}
