// api/changelog.xml.ts
var releases = [
  {
    version: "0.3.1",
    date: "2026-04-06",
    title: "More space to read",
    subtitle: "Reclaimed vertical space, unread badges, instant feed switching, and infinite scroll.",
    items: [
      "Feed source now shown in reader with favicon and name",
      "Removed desktop header bar \u2014 full vertical space for content",
      "Unread count badges in the sidebar per feed",
      "Preload all articles at startup \u2014 instant feed switching",
      '"Load more" button for feeds with 25+ articles',
      'Floating "Mark N read" pill replaces toolbar',
      "Favicons auto-refresh weekly, no manual reload needed"
    ]
  },
  {
    version: "0.3.0",
    date: "2026-04-06",
    title: "Cleaner feeds",
    subtitle: "Tracking pixels, ad click IDs, and UTM parameters stripped automatically. Your feeds, without the surveillance.",
    items: [
      "Tracking pixels stripped from all feed content",
      "UTM parameters and ad click IDs removed from all links",
      "Anonymous feed catalog for future recommendations",
      "Improved changelog with arrow navigation between releases"
    ]
  },
  {
    version: "0.2.2",
    date: "2026-03-29",
    title: "Bug fixes",
    subtitle: "Small improvements and fixes.",
    items: [
      "Fixed favicon loading for sites with non-standard icon paths",
      "Improved feed refresh reliability",
      "Better error messages when adding invalid URLs"
    ]
  },
  {
    version: "0.2.1",
    date: "2026-03-28",
    title: "Visual polish",
    subtitle: "Warmer palette, smooth transitions, and a refined reading experience.",
    items: [
      "Warm background tint and blue-indigo accents",
      "Smooth hover, select, and sidebar transitions",
      "Refined blockquotes, framed images, editorial typography",
      "Unread/read states with bold titles and accent bars",
      "Softer focus rings and reduced-motion support"
    ]
  },
  {
    version: "0.2.0",
    date: "2026-03-28",
    title: "Find your next read",
    subtitle: "Discover feeds, navigate by keyboard, and keep your reading private.",
    items: [
      "Explore 1,000+ feeds by topic or country",
      "Full keyboard navigation \u2014 j/k, Enter, Space, h, o",
      "Unread dots and mark-all-read",
      "Instant feed switching with in-memory cache",
      "Cloud sync with 4-word passphrase",
      "OPML import and export"
    ]
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    title: "A private RSS reader",
    subtitle: "Read feeds with end-to-end encryption. No accounts, no tracking.",
    items: [
      "RSS 2.0, Atom 1.0, and JSON Feed support",
      "Zero-knowledge AES-256 encryption",
      "Cloud sync with passphrase",
      "Full-text article extraction",
      "Dark mode",
      "Keyboard navigation"
    ]
  }
];
function escapeXml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function buildEntryContent(release) {
  const parts = [];
  if (release.subtitle) {
    parts.push(`<p>${escapeXml(release.subtitle)}</p>`);
  }
  parts.push("<ul>");
  for (const item of release.items) {
    parts.push(`<li>${escapeXml(item)}</li>`);
  }
  parts.push("</ul>");
  if (release.richContent) {
    parts.push(release.richContent);
  }
  return parts.join("\n");
}
function buildEntry(release) {
  const content = buildEntryContent(release);
  return `  <entry>
    <id>feedzero:release:${escapeXml(release.version)}</id>
    <title>v${escapeXml(release.version)} \u2014 ${escapeXml(release.title)}</title>
    <updated>${release.date}T00:00:00Z</updated>
    <summary>${escapeXml(release.subtitle)}</summary>
    <content type="html"><![CDATA[${content}]]></content>
  </entry>`;
}
function buildFeed() {
  const updated = releases[0]?.date ?? (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const entries = releases.map(buildEntry).join("\n");
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FeedZero Release Notes</title>
  <subtitle>What's new in FeedZero</subtitle>
  <id>feedzero:changelog</id>
  <updated>${updated}T00:00:00Z</updated>
  <link rel="self" href="/api/changelog.xml" />
  <author>
    <name>FeedZero</name>
  </author>
${entries}
</feed>`;
}
async function handleChangelogRequest(_req) {
  const xml = buildFeed();
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*"
    }
  });
}
async function GET(req) {
  return handleChangelogRequest(req);
}
export {
  GET
};
