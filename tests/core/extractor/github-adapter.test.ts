import { describe, it, expect } from "vitest";
import {
  isGitHubRepoUrl,
  getReadmeUrl,
  githubAdapter,
} from "../../../src/core/extractor/adapters/github-adapter.ts";

describe("isGitHubRepoUrl", () => {
  it("matches repo root URLs", () => {
    expect(isGitHubRepoUrl("https://github.com/owner/repo")).toBe(true);
    expect(isGitHubRepoUrl("https://github.com/owner/repo/")).toBe(true);
    expect(isGitHubRepoUrl("http://github.com/owner/repo")).toBe(true);
  });

  it("rejects non-repo GitHub URLs", () => {
    expect(isGitHubRepoUrl("https://github.com/owner/repo/issues")).toBe(false);
    expect(isGitHubRepoUrl("https://github.com/owner/repo/pulls")).toBe(false);
    expect(isGitHubRepoUrl("https://github.com/owner/repo/blob/main/file.ts")).toBe(false);
    expect(isGitHubRepoUrl("https://github.com/owner/repo/tree/main")).toBe(false);
    expect(isGitHubRepoUrl("https://github.com/owner")).toBe(false);
    expect(isGitHubRepoUrl("https://github.com/")).toBe(false);
  });

  it("rejects non-GitHub URLs", () => {
    expect(isGitHubRepoUrl("https://gitlab.com/owner/repo")).toBe(false);
    expect(isGitHubRepoUrl("https://example.com/owner/repo")).toBe(false);
  });
});

describe("getReadmeUrl", () => {
  it("converts repo URL to raw README URL", () => {
    expect(getReadmeUrl("https://github.com/facebook/react")).toBe(
      "https://raw.githubusercontent.com/facebook/react/HEAD/README.md",
    );
  });

  it("handles trailing slash", () => {
    expect(getReadmeUrl("https://github.com/owner/repo/")).toBe(
      "https://raw.githubusercontent.com/owner/repo/HEAD/README.md",
    );
  });

  it("returns null for non-repo URLs", () => {
    expect(getReadmeUrl("https://github.com/owner/repo/issues")).toBeNull();
    expect(getReadmeUrl("https://example.com/owner/repo")).toBeNull();
  });
});

describe("githubAdapter", () => {
  it("has correct domain registration", () => {
    expect(githubAdapter.domains).toEqual(["github.com"]);
  });

  it("getSourceUrl returns README URL for repo pages", () => {
    expect(githubAdapter.getSourceUrl!("https://github.com/owner/repo")).toBe(
      "https://raw.githubusercontent.com/owner/repo/HEAD/README.md",
    );
  });

  it("getSourceUrl returns null for non-repo GitHub pages", () => {
    expect(githubAdapter.getSourceUrl!("https://github.com/owner/repo/issues")).toBeNull();
  });

  it("extracts markdown content", () => {
    const md = "# My Project\n\nA cool library for doing things.";
    const result = githubAdapter.extract(md, "https://github.com/owner/my-project");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.content).toContain("<h1>");
      expect(result.value.content).toContain("My Project");
      expect(result.value.content).toContain("<p>");
      expect(result.value.title).toBe("My Project");
      expect(result.value.author).toBe("owner");
    }
  });

  it("uses repo name as title when no heading", () => {
    const md = "Just some text without a heading.";
    const result = githubAdapter.extract(md, "https://github.com/owner/repo");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.title).toBe("owner/repo");
    }
  });

  it("returns error for empty content", () => {
    const result = githubAdapter.extract("", "https://github.com/owner/repo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Empty");
    }
  });
});
