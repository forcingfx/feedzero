import { describe, it, expect } from "vitest";
import { isDeployLive } from "../../../scripts/ship/verify-deploy.mjs";

/**
 * "Is my change live?" must be answered exactly, not by waiting a while.
 * Time-based verification is how a green deploy report can accompany stale
 * code; comparing the commit production actually serves cannot.
 */
describe("isDeployLive", () => {
  it("is live when health serves the target commit and reports ok", () => {
    const verdict = isDeployLive({
      health: { ok: true, commit: "abc1234" },
      targetCommit: "abc1234def567890",
    });
    expect(verdict.live).toBe(true);
  });

  it("is not live while an older commit is still served", () => {
    const verdict = isDeployLive({
      health: { ok: true, commit: "0000000" },
      targetCommit: "abc1234def567890",
    });
    expect(verdict.live).toBe(false);
    expect(verdict.reason).toContain("0000000");
  });

  it("is not live when health reports not ok (maintenance or degraded)", () => {
    const verdict = isDeployLive({
      health: { ok: false, commit: "abc1234" },
      targetCommit: "abc1234def567890",
    });
    expect(verdict.live).toBe(false);
    expect(verdict.reason).toMatch(/not ok|maintenance/i);
  });

  it("is not live when the deployment cannot identify its commit", () => {
    // "unknown" must never satisfy a prefix check against a real SHA.
    const verdict = isDeployLive({
      health: { ok: true, commit: "unknown" },
      targetCommit: "abc1234def567890",
    });
    expect(verdict.live).toBe(false);
  });

  it("is not live when health could not be fetched at all", () => {
    const verdict = isDeployLive({ health: null, targetCommit: "abc1234" });
    expect(verdict.live).toBe(false);
    expect(verdict.reason).toMatch(/unreachable|no response/i);
  });

  it("requires the served commit to prefix the target, not merely overlap", () => {
    // A short SHA that is not a prefix (e.g. a different commit that shares
    // characters) must not pass.
    const verdict = isDeployLive({
      health: { ok: true, commit: "bc1234d" },
      targetCommit: "abc1234def567890",
    });
    expect(verdict.live).toBe(false);
  });
});
