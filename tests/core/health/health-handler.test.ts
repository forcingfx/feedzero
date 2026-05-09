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
