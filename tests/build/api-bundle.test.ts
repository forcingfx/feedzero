import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { SUPPORTED_METHODS } from "@/core/sync/sync-handler";

const apiDir = resolve("api");

describe("API bundle contract", () => {
  beforeAll(() => {
    // Restore original .ts source from git, then run the build script
    execSync("git checkout -- api/", { stdio: "pipe" });
    execSync("node scripts/build-api.js", { stdio: "pipe" });
  });

  afterAll(() => {
    // Restore original .ts source files
    execSync("git checkout -- api/", { stdio: "pipe" });
  });

  it("replaces api/*.ts with self-contained bundles (no external imports)", () => {
    for (const name of ["feed.ts", "page.ts", "sync.ts"]) {
      expect(existsSync(join(apiDir, name)), `${name} should still exist`).toBe(
        true,
      );

      const content = readFileSync(join(apiDir, name), "utf-8");

      // Bundled output should NOT contain imports from ../src/
      expect(content).not.toMatch(/from\s+["']\.\.\/src\//);

      // Bundled output should contain actual function logic (not just re-exports)
      expect(content.length).toBeGreaterThan(200);
    }
  });

  // Bundles are esbuild output that violates the strict tsconfig (implicit any
  // etc.). Since tests/server.test.ts imports api/* for routing contract tests,
  // the bundles get pulled into typecheck via reference. Prepending @ts-nocheck
  // tells tsc to skip them — src/ originals are still typechecked normally.
  it("each bundled api/*.ts starts with // @ts-nocheck", () => {
    const allBundles = [
      "feed.ts",
      "page.ts",
      "sync.ts",
      "feedback.ts",
      "icon.ts",
      "briefing.ts",
      "catalog.ts",
      "stats-sync.ts",
    ];
    for (const name of allBundles) {
      const content = readFileSync(join(apiDir, name), "utf-8");
      expect(
        content.startsWith("// @ts-nocheck"),
        `${name} should start with // @ts-nocheck`,
      ).toBe(true);
    }
  });

  it("no .js files are produced in api/", () => {
    expect(existsSync(join(apiDir, "feed.js"))).toBe(false);
    expect(existsSync(join(apiDir, "page.js"))).toBe(false);
    expect(existsSync(join(apiDir, "sync.js"))).toBe(false);
  });

  it("bundled feed.ts exports GET", async () => {
    const mod = await import(join(apiDir, "feed.ts"));
    expect(typeof mod.GET).toBe("function");
  });

  it("bundled page.ts exports GET", async () => {
    const mod = await import(join(apiDir, "page.ts"));
    expect(typeof mod.GET).toBe("function");
  });

  it("bundled sync.ts exports every supported method", async () => {
    const mod = await import(join(apiDir, "sync.ts"));
    for (const method of SUPPORTED_METHODS) {
      expect(typeof mod[method], `sync.ts missing export for ${method}`).toBe(
        "function",
      );
    }
  });

  it("bundled feed handler returns a response", async () => {
    const mod = await import(join(apiDir, "feed.ts"));
    const req = new Request("http://localhost/api/feed");
    const res = await mod.GET(req);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(400);
  });
});
