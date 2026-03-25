/** Flag emoji regex: two regional indicator symbols (Unicode block 1F1E6–1F1FF). */
const FLAG_EMOJI_RE = /^([\u{1F1E0}-\u{1F1FF}]{2})\s+(.+)$/u;

/** Table separator row (dashes and pipes). */
const SEPARATOR_RE = /^[\s\-|]+$/;

/** news-feed-list entry: - ✅ [Name](siteUrl) - [Feed](feedUrl) */
const NEWS_FEED_RE =
  /^-\s*✅\s*\[([^\]]+)\]\(([^)]+)\)\s*-\s*\[Feed\]\(([^)]+)\)/;

export interface ParsedFeed {
  name: string;
  feedUrl: string;
  siteUrl: string;
  healthy: boolean;
}

export interface ParsedCountry {
  id: string;
  name: string;
  emoji: string;
  feeds: ParsedFeed[];
}

export interface ParsedTopic {
  id: string;
  name: string;
  feeds: ParsedFeed[];
}

/** A newspaper-style section grouping multiple topics. */
export interface ParsedSection {
  id: string;
  name: string;
  emoji: string;
  subcategories: ParsedTopic[];
}

export interface ParsedCatalog {
  generatedAt: string;
  sourceUrl: string;
  countries: ParsedCountry[];
  topics: ParsedTopic[];
  sections: ParsedSection[];
}

/** Maps raw topic names to newspaper-style sections. */
const SECTION_MAP: Record<string, { section: string; emoji: string }> = {
  "News": { section: "News & Politics", emoji: "📰" },
  "Business & Economy": { section: "Business & Money", emoji: "💼" },
  "Personal finance": { section: "Business & Money", emoji: "💼" },
  "Startups": { section: "Business & Money", emoji: "💼" },
  "Tech": { section: "Technology", emoji: "💻" },
  "Android": { section: "Technology", emoji: "💻" },
  "Android Development": { section: "Technology", emoji: "💻" },
  "Apple": { section: "Technology", emoji: "💻" },
  "iOS Development": { section: "Technology", emoji: "💻" },
  "Programming": { section: "Technology", emoji: "💻" },
  "Web Development": { section: "Technology", emoji: "💻" },
  "UI / UX": { section: "Technology", emoji: "💻" },
  "Science": { section: "Science & Space", emoji: "🔬" },
  "Space": { section: "Science & Space", emoji: "🔬" },
  "Movies": { section: "Culture & Entertainment", emoji: "🎭" },
  "Television": { section: "Culture & Entertainment", emoji: "🎭" },
  "Music": { section: "Culture & Entertainment", emoji: "🎭" },
  "Books": { section: "Culture & Entertainment", emoji: "🎭" },
  "Gaming": { section: "Culture & Entertainment", emoji: "🎭" },
  "Funny": { section: "Culture & Entertainment", emoji: "🎭" },
  "Sports": { section: "Sports", emoji: "⚽" },
  "Football": { section: "Sports", emoji: "⚽" },
  "Cricket": { section: "Sports", emoji: "⚽" },
  "Tennis": { section: "Sports", emoji: "⚽" },
  "Food": { section: "Lifestyle", emoji: "✨" },
  "Travel": { section: "Lifestyle", emoji: "✨" },
  "Fashion": { section: "Lifestyle", emoji: "✨" },
  "Beauty": { section: "Lifestyle", emoji: "✨" },
  "Photography": { section: "Lifestyle", emoji: "✨" },
  "Architecture": { section: "Home & Design", emoji: "🏠" },
  "Interior design": { section: "Home & Design", emoji: "🏠" },
  "DIY": { section: "Home & Design", emoji: "🏠" },
  "Cars": { section: "Cars & Transport", emoji: "🚗" },
  "History": { section: "History", emoji: "📜" },
};

/** Maps country names to ISO 3166-1 alpha-2 codes for flag emoji generation. */
const COUNTRY_CODES: Record<string, string> = {
  "afghanistan": "AF", "albania": "AL", "algeria": "DZ", "andorra": "AD",
  "argentina": "AR", "armenia": "AM", "australia": "AU", "austria": "AT",
  "azerbaijan": "AZ", "bahamas": "BS", "bangladesh": "BD", "barbados": "BB",
  "belarus": "BY", "belgium": "BE", "belize": "BZ", "benin": "BJ",
  "bermuda": "BM", "bolivia": "BO", "bosnia and herzegovina": "BA",
  "brazil": "BR", "bulgaria": "BG", "burundi": "BI", "cambodia": "KH",
  "cameroon": "CM", "canada": "CA", "cayman islands": "KY", "chile": "CL",
  "colombia": "CO", "costa rica": "CR", "croatia": "HR", "cuba": "CU",
  "cyprus": "CY", "czech republic": "CZ",
  "democratic republic of the congo": "CD", "denmark": "DK",
  "djibouti": "DJ", "dominica": "DM", "dominican republic": "DO",
  "ecuador": "EC", "egypt": "EG", "eritrea": "ER", "estonia": "EE",
  "ethiopia": "ET", "faroe islands": "FO", "finland": "FI", "france": "FR",
  "french guiana": "GF", "french polynesia": "PF", "gabon": "GA",
  "germany": "DE", "ghana": "GH", "gibraltar": "GI", "greece": "GR",
  "guatemala": "GT", "guinea": "GN", "guyana": "GY", "haiti": "HT",
  "hong kong": "HK", "hong kong sar china": "HK", "hungary": "HU",
  "iceland": "IS", "india": "IN", "indonesia": "ID", "iraq": "IQ",
  "iran": "IR", "islamic republic of iran": "IR", "ireland": "IE",
  "isle of man": "IM", "israel": "IL", "italy": "IT", "jamaica": "JM",
  "japan": "JP", "jordan": "JO", "kazakhstan": "KZ", "kenya": "KE",
  "kosovo": "XK", "kyrgyzstan": "KG", "latvia": "LV", "liberia": "LR",
  "libya": "LY", "lithuania": "LT", "luxembourg": "LU", "madagascar": "MG",
  "malawi": "MW", "malaysia": "MY", "maldives": "MV", "mali": "ML",
  "malta": "MT", "martinique": "MQ", "mauritius": "MU", "mexico": "MX",
  "moldova, republic of": "MD", "moldova republic of": "MD",
  "monaco": "MC", "mongolia": "MN", "montenegro": "ME", "morocco": "MA",
  "myanmar": "MM", "myanmar (burma)": "MM", "namibia": "NA", "nepal": "NP",
  "netherlands": "NL", "new zealand": "NZ", "nicaragua": "NI",
  "niger": "NE", "nigeria": "NG", "norway": "NO", "pakistan": "PK",
  "panama": "PA", "peru": "PE", "philippines": "PH", "poland": "PL",
  "portugal": "PT", "puerto rico": "PR",
  "republic of the gambia": "GM", "romania": "RO",
  "russia": "RU", "russian federation": "RU",
  "saint kitts and nevis": "KN", "samoa": "WS", "san marino": "SM",
  "senegal": "SN", "serbia": "RS", "sierra leone": "SL",
  "singapore": "SG", "slovakia": "SK", "slovenia": "SI",
  "solomon islands": "SB", "somalia": "SO", "south africa": "ZA",
  "south korea": "KR", "spain": "ES", "sri lanka": "LK",
  "state of palestine": "PS", "suriname": "SR", "sweden": "SE",
  "switzerland": "CH", "syrian arab republic": "SY", "thailand": "TH",
  "the republic of north macedonia": "MK", "togo": "TG", "tunisia": "TN",
  "türkiye": "TR", "turkey": "TR", "uganda": "UG", "ukraine": "UA",
  "united kingdom": "GB", "united states": "US",
  "united states of america": "US", "uruguay": "UY", "uzbekistan": "UZ",
  "venezuela": "VE", "vietnam": "VN",
  "virgin islands, u.s.": "VI", "virgin islands u.s.": "VI",
  "yemen": "YE", "zambia": "ZM", "zimbabwe": "ZW",
};

/** Converts an ISO 3166-1 alpha-2 code to a flag emoji. */
function codeToFlag(code: string): string {
  return [...code.toUpperCase()]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}

/** Looks up a flag emoji for a country name. Returns empty string if unknown. */
export function countryToFlag(name: string): string {
  const code = COUNTRY_CODES[name.toLowerCase()];
  return code ? codeToFlag(code) : "";
}

export function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function deriveSiteUrl(domain: string): string {
  const trimmed = domain.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function parseTableRow(line: string): string[] {
  return line.split("|").map((cell) => cell.trim());
}

function parseFeedsFromLines(
  lines: string[],
  isCountry: boolean,
): ParsedFeed[] {
  const feeds: ParsedFeed[] = [];

  for (const line of lines) {
    if (SEPARATOR_RE.test(line)) continue;

    const cells = parseTableRow(line);
    const name = cells[0] ?? "";
    const feedUrl = cells[1] ?? "";

    if (!name || !feedUrl || !feedUrl.startsWith("http")) continue;

    const thirdCol = cells[2] ?? "";
    const siteUrl = isCountry ? thirdCol : deriveSiteUrl(thirdCol);

    if (!siteUrl) continue;

    feeds.push({ name, feedUrl, siteUrl, healthy: true });
  }

  return feeds;
}

/** Groups raw topics into newspaper-style sections. */
function groupIntoSections(topics: ParsedTopic[]): ParsedSection[] {
  const sectionMap = new Map<string, ParsedSection>();

  for (const topic of topics) {
    const mapping = SECTION_MAP[topic.name];
    if (!mapping) continue;

    let section = sectionMap.get(mapping.section);
    if (!section) {
      section = {
        id: toSlug(mapping.section),
        name: mapping.section,
        emoji: mapping.emoji,
        subcategories: [],
      };
      sectionMap.set(mapping.section, section);
    }
    section.subcategories.push(topic);
  }

  return Array.from(sectionMap.values());
}

/** Parses the awesome-rss-feeds README.md into structured catalog data. */
export function parseAwesomeRssFeeds(markdown: string): ParsedCatalog {
  const countries: ParsedCountry[] = [];
  const topics: ParsedTopic[] = [];

  const rawSections = markdown.split(/^### /m).slice(1);

  for (const section of rawSections) {
    const [headingLine, ...rest] = section.split("\n");
    const heading = headingLine.trim();

    const contentLines = rest.filter(
      (line) => line.trim() && !line.trim().match(/^(Title|Source)\s*\|/i),
    );

    const flagMatch = heading.match(FLAG_EMOJI_RE);

    if (flagMatch) {
      const emoji = flagMatch[1];
      const name = flagMatch[2].trim();
      const feeds = parseFeedsFromLines(contentLines, true);
      if (feeds.length > 0) {
        countries.push({ id: toSlug(name), name, emoji, feeds });
      }
    } else {
      const feeds = parseFeedsFromLines(contentLines, false);
      if (feeds.length > 0) {
        topics.push({ id: toSlug(heading), name: heading, feeds });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceUrl: "https://github.com/plenaryapp/awesome-rss-feeds",
    countries,
    topics,
    sections: groupIntoSections(topics),
  };
}

/** Parses the news-feed-list-of-countries README.md into country feeds. */
export function parseNewsFeedList(markdown: string): ParsedCountry[] {
  const countries: ParsedCountry[] = [];

  // Sections start with ## Country Name (h2) or ### Country Name (h3)
  const rawSections = markdown.split(/^#{2,3}\s+/m).slice(1);

  for (const section of rawSections) {
    const [headingLine, ...rest] = section.split("\n");
    const name = headingLine.trim();
    if (!name) continue;

    const feeds: ParsedFeed[] = [];
    for (const line of rest) {
      const match = line.match(NEWS_FEED_RE);
      if (match) {
        feeds.push({
          name: match[1].trim(),
          feedUrl: match[3].trim(),
          siteUrl: match[2].trim(),
          healthy: true,
        });
      }
    }

    if (feeds.length > 0) {
      countries.push({
        id: toSlug(name),
        name,
        emoji: countryToFlag(name),
        feeds,
      });
    }
  }

  return countries;
}

/** Merges two country lists, deduplicating by feed URL within each country. */
export function mergeCountries(
  primary: ParsedCountry[],
  secondary: ParsedCountry[],
): ParsedCountry[] {
  const merged = new Map<string, ParsedCountry>();

  // Primary goes in first
  for (const country of primary) {
    merged.set(country.id, { ...country, feeds: [...country.feeds] });
  }

  // Secondary adds new countries or deduplicates feeds into existing
  for (const country of secondary) {
    const existing = merged.get(country.id);
    if (existing) {
      const existingUrls = new Set(existing.feeds.map((f) => f.feedUrl));
      for (const feed of country.feeds) {
        if (!existingUrls.has(feed.feedUrl)) {
          existing.feeds.push(feed);
        }
      }
      // Prefer non-empty emoji
      if (!existing.emoji && country.emoji) {
        existing.emoji = country.emoji;
      }
    } else {
      merged.set(country.id, { ...country, feeds: [...country.feeds] });
    }
  }

  return Array.from(merged.values());
}
