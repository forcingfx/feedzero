import { releases, type ChangelogRelease } from "./releases.ts";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEntryContent(release: ChangelogRelease): string {
  const parts: string[] = [];

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

function toTimestamp(date: string): string {
  return date.includes("T") ? date : `${date}T00:00:00Z`;
}

function buildEntry(release: ChangelogRelease): string {
  const content = buildEntryContent(release);
  const ts = toTimestamp(release.date);

  return `  <entry>
    <id>feedzero:release:${escapeXml(release.version)}</id>
    <title>v${escapeXml(release.version)} — ${escapeXml(release.title)}</title>
    <link rel="alternate" href="/api/changelog.xml#v${escapeXml(release.version)}" />
    <published>${ts}</published>
    <updated>${ts}</updated>
    <summary>${escapeXml(release.subtitle)}</summary>
    <content type="html"><![CDATA[${content}]]></content>
    <author><name>FeedZero</name></author>
  </entry>`;
}

function buildFeed(): string {
  const updated = toTimestamp(releases[0]?.date ?? new Date().toISOString());

  const entries = releases.map(buildEntry).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>FeedZero Release Notes</title>
  <subtitle>What's new in FeedZero</subtitle>
  <id>feedzero:changelog</id>
  <updated>${updated}</updated>
  <link rel="self" href="/api/changelog.xml" />
  <author>
    <name>FeedZero</name>
  </author>
${entries}
</feed>`;
}

/** Handle changelog feed requests. Returns Atom XML. */
export async function handleChangelogRequest(
  _req: Request,
): Promise<Response> {
  const xml = buildFeed();

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
