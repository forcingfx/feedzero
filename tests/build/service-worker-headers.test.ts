// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Pins how the hosted deployment serves /sw.js.
 *
 * Rationale: a service worker is the one kind of bug that outlives a deploy,
 * because it runs from the user's browser. The way out is always "ship a
 * fixed /sw.js", and that only works if no cache between us and the browser
 * can keep answering with the broken one. Loosening this header trades that
 * escape hatch for nothing: the file is 5 KB.
 */

interface HeaderRule {
  source: string;
  headers: { key: string; value: string }[];
}

const vercelConfig = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../vercel.json"), "utf8"),
) as { headers: HeaderRule[] };

describe("vercel.json: /sw.js", () => {
  const rule = vercelConfig.headers.find((r) => r.source === "/sw.js");

  it("is served with no-cache so a fixed worker reaches browsers on their next check", () => {
    const cacheControl = rule?.headers.find((h) => h.key === "Cache-Control");

    expect(cacheControl?.value).toBe("no-cache");
  });

  it("is served as JavaScript, which browsers require before they will install it", () => {
    const contentType = rule?.headers.find((h) => h.key === "Content-Type");

    expect(contentType?.value).toMatch(/^application\/javascript/);
  });
});
