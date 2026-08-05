import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { handleHealthRequest } from "../../../src/core/health/health-handler";

const ORIGINAL_ENV = { ...process.env };

describe("handleHealthRequest", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAINTENANCE_MODE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns 200 with ok:true and a version+time payload", async () => {
    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(typeof body.time).toBe("string");
    // ISO timestamp parse round-trip
    expect(new Date(body.time).toISOString()).toBe(body.time);
  });

  it("sets Cache-Control: no-store so uptime monitors always hit live state", async () => {
    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 503 with maintenance:true when MAINTENANCE_MODE=1", async () => {
    process.env.MAINTENANCE_MODE = "1";

    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.maintenance).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(typeof body.time).toBe("string");
  });

  it("ignores MAINTENANCE_MODE values other than \"1\"", async () => {
    process.env.MAINTENANCE_MODE = "true";

    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );

    expect(res.status).toBe(200);
  });
});

/**
 * Deploy verification needs to answer "is MY change live?" exactly, not
 * approximately. Version alone cannot: most changes ship without a version
 * bump. The commit can, so /ship polls health until it reports the SHA it
 * just merged (scripts/ship/verify-deploy.mjs).
 */
describe("handleHealthRequest — deployed commit", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.MAINTENANCE_MODE;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("reports the short SHA of the deployed commit", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abc1234def5678901234";

    const body = await (
      await handleHealthRequest(new Request("http://localhost/api/health"))
    ).json();

    expect(body.commit).toBe("abc1234");
  });

  it("reports 'unknown' when no commit is injected, still 200", async () => {
    delete process.env.VERCEL_GIT_COMMIT_SHA;

    // Self-hosted images have no Vercel git metadata; health must stay a 200
    // there rather than degrading the one endpoint that reports liveness.
    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).commit).toBe("unknown");
  });

  it("still reports the commit in a maintenance response", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "fedcba9876543210";
    process.env.MAINTENANCE_MODE = "1";

    const res = await handleHealthRequest(
      new Request("http://localhost/api/health"),
    );

    expect(res.status).toBe(503);
    expect((await res.json()).commit).toBe("fedcba9");
  });
});
