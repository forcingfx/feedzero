import { describe, it, expect } from "vitest";
import {
  subredditFeedUrl,
  commentsFeedUrl,
  parseSubredditFeed,
  parseCommentsFeed,
  htmlToText,
  renderResearchMarkdown,
} from "@/core/reddit/reddit-rss.ts";
import { isOk, isErr, unwrap } from "@/utils/result.ts";

const SUBREDDIT_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>RSS - the open standard</title>
  <subtitle>Discussion about RSS</subtitle>
  <entry>
    <title>How do you organize your feeds?</title>
    <author><name>/u/alice</name><uri>https://www.reddit.com/user/alice</uri></author>
    <link href="https://www.reddit.com/r/rss/comments/abc123/how_do_you_organize/" />
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;I have 200 feeds &amp;amp; counting.&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; submitted by &lt;a href="https://www.reddit.com/user/alice"&gt;/u/alice&lt;/a&gt;</content>
    <updated>2026-05-20T10:00:00+00:00</updated>
    <id>t3_abc123</id>
  </entry>
  <entry>
    <title>Best self-hosted reader in 2026?</title>
    <author><name>/u/bob</name></author>
    <link href="https://www.reddit.com/r/rss/comments/def456/best_selfhosted/" />
    <content type="html">&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt;</content>
    <updated>2026-05-19T08:30:00+00:00</updated>
    <id>t3_def456</id>
  </entry>
</feed>`;

const COMMENTS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>How do you organize your feeds?</title>
  <entry>
    <title>comment by /u/carol</title>
    <author><name>/u/carol</name></author>
    <link href="https://www.reddit.com/r/rss/comments/abc123/x/c1/" />
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Folders by topic.&lt;/p&gt;&lt;/div&gt;</content>
    <updated>2026-05-21T12:00:00+00:00</updated>
    <id>t1_c1</id>
  </entry>
  <entry>
    <title>comment by /u/dave</title>
    <author><name>/u/dave</name></author>
    <link href="https://www.reddit.com/r/rss/comments/abc123/x/c2/" />
    <content type="html">&lt;div class="md"&gt;&lt;p&gt;Tags, not folders.&lt;/p&gt;&lt;/div&gt;</content>
    <updated>2026-05-21T13:00:00+00:00</updated>
    <id>t1_c2</id>
  </entry>
</feed>`;

describe("subredditFeedUrl", () => {
  it("builds a .rss listing URL with limit", () => {
    expect(unwrap(subredditFeedUrl("rss", 25))).toBe(
      "https://www.reddit.com/r/rss/.rss?limit=25",
    );
  });

  it("strips a leading r/ prefix and trims", () => {
    expect(unwrap(subredditFeedUrl("  r/RSS  ", 10))).toBe(
      "https://www.reddit.com/r/RSS/.rss?limit=10",
    );
  });

  it("clamps the limit to Reddit's 1..100 range", () => {
    expect(unwrap(subredditFeedUrl("rss", 9999))).toContain("limit=100");
    expect(unwrap(subredditFeedUrl("rss", 0))).toContain("limit=1");
  });

  it("rejects an invalid subreddit name", () => {
    expect(isErr(subredditFeedUrl("../etc/passwd", 25))).toBe(true);
    expect(isErr(subredditFeedUrl("", 25))).toBe(true);
  });
});

describe("commentsFeedUrl", () => {
  it("appends /.rss to a post permalink", () => {
    expect(
      unwrap(commentsFeedUrl("https://www.reddit.com/r/rss/comments/abc123/title/")),
    ).toBe("https://www.reddit.com/r/rss/comments/abc123/title/.rss");
  });

  it("handles a permalink with no trailing slash", () => {
    expect(
      unwrap(commentsFeedUrl("https://www.reddit.com/r/rss/comments/abc123/title")),
    ).toBe("https://www.reddit.com/r/rss/comments/abc123/title/.rss");
  });

  it("rejects a non-http permalink", () => {
    expect(isErr(commentsFeedUrl("javascript:alert(1)"))).toBe(true);
  });
});

describe("htmlToText", () => {
  it("strips tags and decodes entities", () => {
    expect(htmlToText("<p>200 feeds &amp; counting</p>")).toBe(
      "200 feeds & counting",
    );
  });

  it("turns block boundaries into blank lines", () => {
    expect(htmlToText("<p>One</p><p>Two</p>")).toBe("One\n\nTwo");
  });

  it("drops Reddit's SC_OFF/SC_ON marker comments", () => {
    expect(htmlToText("<!-- SC_OFF --><div>Body</div><!-- SC_ON -->")).toBe(
      "Body",
    );
  });

  it("returns empty string for empty markup", () => {
    expect(htmlToText("<div></div>")).toBe("");
    expect(htmlToText("")).toBe("");
  });
});

describe("parseSubredditFeed", () => {
  it("extracts posts with author, permalink, date and body text", () => {
    const result = parseSubredditFeed(SUBREDDIT_FEED);
    expect(isOk(result)).toBe(true);
    const posts = unwrap(result);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      title: "How do you organize your feeds?",
      permalink: "https://www.reddit.com/r/rss/comments/abc123/how_do_you_organize/",
      author: "/u/alice",
    });
    expect(posts[0].bodyText).toContain("200 feeds & counting");
    expect(posts[0].publishedAt).toBe(Date.parse("2026-05-20T10:00:00+00:00"));
  });

  it("yields empty body text for a link-only post", () => {
    const posts = unwrap(parseSubredditFeed(SUBREDDIT_FEED));
    expect(posts[1].bodyText).toBe("");
  });

  it("errors on non-feed input", () => {
    expect(isErr(parseSubredditFeed("not xml"))).toBe(true);
    expect(isErr(parseSubredditFeed(""))).toBe(true);
  });
});

describe("parseCommentsFeed", () => {
  it("extracts flat comments with author and text", () => {
    const comments = unwrap(parseCommentsFeed(COMMENTS_FEED));
    expect(comments).toHaveLength(2);
    expect(comments[0]).toMatchObject({
      author: "/u/carol",
      text: "Folders by topic.",
    });
    expect(comments[1].text).toBe("Tags, not folders.");
  });

  it("errors on non-feed input", () => {
    expect(isErr(parseCommentsFeed("garbage"))).toBe(true);
  });
});

describe("renderResearchMarkdown", () => {
  it("renders posts and their comments into a readable document", () => {
    const posts = unwrap(parseSubredditFeed(SUBREDDIT_FEED));
    const comments = unwrap(parseCommentsFeed(COMMENTS_FEED));
    const md = renderResearchMarkdown(
      "rss",
      [
        { post: posts[0], comments },
        { post: posts[1], comments: [] },
      ],
      Date.parse("2026-05-22T00:00:00+00:00"),
    );

    expect(md).toContain("# r/rss");
    expect(md).toContain("2 posts");
    expect(md).toContain("## 1. How do you organize your feeds?");
    expect(md).toContain("/u/alice");
    expect(md).toContain("2026-05-20");
    expect(md).toContain("200 feeds & counting");
    expect(md).toContain("Comments (2)");
    expect(md).toContain("/u/carol");
    expect(md).toContain("Folders by topic.");
    // Link-only post still renders, with a no-selftext marker and no comments.
    expect(md).toContain("## 2. Best self-hosted reader in 2026?");
    expect(md).toContain("_(no selftext)_");
    expect(md).toContain("Comments (0)");
  });
});
