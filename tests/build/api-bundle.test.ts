import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, unlinkSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { SUPPORTED_METHODS } from "@/core/sync/sync-handler";

const srcApiDir = resolve("src/api");
const outApiDir = resolve("api");
const bundledFiles = () =>
  readdirSync(outApiDir).filter((f: string) => f.endsWith(".js"));

describe("API bundle contract", () => {
  beforeAll(() => {
    execSync("node scripts/build-api.js", { stdio: "pipe" });
  });

  afterAll(() => {
    for (const file of bundledFiles()) {
      unlinkSync(join(outApiDir, file));
    }
  });

  it("produces a .js bundle for each .ts source file", () => {
    const tsFiles = readdirSync(srcApiDir)
      .filter((f: string) => f.endsWith(".ts"))
      .map((f: string) => f.replace(".ts", ".js"));

    for (const expected of tsFiles) {
      expect(
        existsSync(join(outApiDir, expected)),
        `Missing bundle: ${expected}`,
      ).toBe(true);
    }
  });

  it("feed.js exports GET", async () => {
    const mod = await import(join(outApiDir, "feed.js"));
    expect(typeof mod.GET).toBe("function");
  });

  it("page.js exports GET", async () => {
    const mod = await import(join(outApiDir, "page.js"));
    expect(typeof mod.GET).toBe("function");
  });

  it("sync.js exports every supported method", async () => {
    const mod = await import(join(outApiDir, "sync.js"));
    for (const method of SUPPORTED_METHODS) {
      expect(typeof mod[method], `sync.js missing export for ${method}`).toBe(
        "function",
      );
    }
  });

  it("bundled feed handler returns a response", async () => {
    const mod = await import(join(outApiDir, "feed.js"));
    const req = new Request("http://localhost/api/feed");
    const res = await mod.GET(req);
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(400);
  });
});
