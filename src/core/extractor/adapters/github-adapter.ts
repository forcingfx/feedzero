import { ok, err } from "../../../../packages/core/src/utils/result";
import type { Result } from "../../../../packages/core/src/utils/result";
import type { ExtractionResult } from "../defuddle-extractor.ts";
import { markdownToHtml } from "../markdown.ts";
import type { SiteAdapter } from "./types.ts";

/**
 * Matches github.com/<owner>/<repo> URLs (the repo root).
 * Does NOT match sub-paths like issues, pulls, blob, tree, etc.
 */
const REPO_PATTERN = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;

/** Check if a URL points to a GitHub repository root page. */
export function isGitHubRepoUrl(url: string): boolean {
  return REPO_PATTERN.test(url);
}

/** Convert a GitHub repo URL to its raw README.md URL. */
export function getReadmeUrl(url: string): string | null {
  const match = url.match(REPO_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/README.md`;
}

export const githubAdapter: SiteAdapter = {
  name: "github",
  domains: ["github.com"],

  getSourceUrl(url: string): string | null {
    return getReadmeUrl(url);
  },

  extract(text: string, url: string): Result<ExtractionResult> {
    if (!text || !text.trim()) {
      return err("Empty README content");
    }

    const html = markdownToHtml(text);
    if (!html) {
      return err("Markdown conversion produced no content");
    }

    // Extract title from first heading or repo name
    const match = url.match(REPO_PATTERN);
    const repoName = match ? `${match[1]}/${match[2]}` : "";
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : repoName;

    return ok({
      content: html,
      title,
      author: match?.[1] ?? "",
      excerpt: "",
    });
  },
};
