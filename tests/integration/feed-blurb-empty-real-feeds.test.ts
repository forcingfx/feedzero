import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parse } from "../../src/core/parser/parser.ts";
import { isFeedBlurbEmpty } from "../../src/lib/content-modes.ts";
import { unwrap } from "@feedzero/core/utils/result";

// Lock the empty-blurb auto-switch against a real Daring Fireball feed
// snapshot. DF was the original reproduction in the bug report — its
// Linked-List entries have short HTML content with `&nbsp;` entities,
// which is the exact shape that earlier broke the textarea-based entity
// decode in non-spec DOM environments. None of the 48 entries in the
// snapshot has a blank blurb; if a future parser or sanitizer change
// strips DF content down to empty text, this test fails first.
describe("isFeedBlurbEmpty against real-world feeds", () => {
  it("does not flag any Daring Fireball entry as empty", () => {
    const xml = fs.readFileSync(
      path.join(__dirname, "../fixtures/daringfireball-2026-05-25.xml"),
      "utf8",
    );
    const result = unwrap(parse(xml, "https://daringfireball.net/feeds/main"));
    const offenders = result.articles
      .filter((a) => isFeedBlurbEmpty(a.content, a.summary))
      .map((a) => ({ title: a.title, link: a.link, contentLen: a.content.length }));
    expect(offenders).toEqual([]);
    expect(result.articles.length).toBeGreaterThan(10);
  });
});
