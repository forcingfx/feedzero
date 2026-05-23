import { describe, expect, it } from "vitest";
import {
  auditEnvSpec,
  parseEnvFile,
  scanEnvReferences,
  type EnvSpec,
} from "@/core/env-audit/audit";

describe("scanEnvReferences", () => {
  it("matches `process.env.NAME` references", () => {
    const source = `
      const k = process.env.FOO;
      const j = process.env.BAR_BAZ;
    `;
    expect(scanEnvReferences(source)).toEqual(new Set(["FOO", "BAR_BAZ"]));
  });

  it("matches the destructured `env.NAME` form used inside resolvers", () => {
    // The Upstash adapters take `env` as a parameter and read `env.X`. The
    // scanner must catch both to give the full picture.
    const source = `function f(env) { return env.UPSTASH_REDIS_REST_URL; }`;
    expect(scanEnvReferences(source)).toContain("UPSTASH_REDIS_REST_URL");
  });

  it("matches `import.meta.env.VITE_X` references", () => {
    const source = `if (import.meta.env.VITE_SELF_HOSTED === "1") { ... }`;
    expect(scanEnvReferences(source)).toContain("VITE_SELF_HOSTED");
  });

  it("excludes runtime-only names that aren't deployment config", () => {
    // NODE_ENV is a tooling/runtime signal, not a config knob the operator
    // sets in Vercel. Same for VITEST. The scanner filters them so the
    // spec stays focused on deployment config.
    const source = `
      if (process.env.NODE_ENV === "production") {}
      if (process.env.VITEST) {}
      const x = process.env.REAL_CONFIG;
    `;
    expect(scanEnvReferences(source)).toEqual(new Set(["REAL_CONFIG"]));
  });

  it("returns an empty set for source with no env references", () => {
    expect(scanEnvReferences("const x = 1;")).toEqual(new Set());
  });
});

describe("parseEnvFile", () => {
  it("returns the set of KEY names from a .env-format string", () => {
    const text = [
      "# Comment",
      "FOO=bar",
      "BAR_BAZ=qux quux",
      "",
      "QUOTED=\"hello world\"",
    ].join("\n");
    expect(parseEnvFile(text)).toEqual(new Set(["FOO", "BAR_BAZ", "QUOTED"]));
  });

  it("ignores blank lines and comments", () => {
    expect(parseEnvFile("\n\n# only comments\n")).toEqual(new Set());
  });

  it("ignores lines without an equals sign", () => {
    // Defensive: corrupt env file lines should not produce phantom names.
    expect(parseEnvFile("KEY=value\nnotakey\n")).toEqual(new Set(["KEY"]));
  });
});

describe("auditEnvSpec", () => {
  const spec: EnvSpec = {
    FOO: { required: "production", description: "x" },
    BAR: { required: "self-host", description: "x" },
    OPT: { required: "optional", description: "x" },
  };

  it("flags names referenced in source but missing from the spec", () => {
    const result = auditEnvSpec({
      spec,
      referenced: new Set(["FOO", "NEW_UNDOCUMENTED"]),
    });
    expect(result.undocumented).toEqual(["NEW_UNDOCUMENTED"]);
  });

  it("flags spec entries that no source file references", () => {
    // A spec entry without a source reference is dead config — either the
    // code was removed and the spec stale, or the spec was added without
    // the implementing code (typo, in-progress branch).
    const result = auditEnvSpec({
      spec,
      referenced: new Set(["FOO", "BAR"]),
    });
    expect(result.unused).toEqual(["OPT"]);
  });

  it("returns empty arrays when source and spec agree", () => {
    const result = auditEnvSpec({
      spec,
      referenced: new Set(["FOO", "BAR", "OPT"]),
    });
    expect(result.undocumented).toEqual([]);
    expect(result.unused).toEqual([]);
  });

  describe("with a deployed-env snapshot", () => {
    it("flags required spec entries missing from the deployed env", () => {
      // Operator runs `vercel env pull .env.production.local` then this
      // audit. A missing required name is the 2026-05-12 incident shape.
      const result = auditEnvSpec({
        spec,
        referenced: new Set(["FOO", "BAR", "OPT"]),
        deployedEnv: new Set(["BAR", "OPT"]),
      });
      expect(result.missingFromDeployment).toEqual(["FOO"]);
    });

    it("flags self-host-only entries when auditing a production env", () => {
      // BAR is self-host-only and must not appear in the Vercel env.
      const result = auditEnvSpec({
        spec,
        referenced: new Set(["FOO", "BAR", "OPT"]),
        deployedEnv: new Set(["FOO", "BAR", "OPT"]),
        deploymentTarget: "production",
      });
      expect(result.staleInDeployment).toEqual(["BAR"]);
    });

    it("does not flag optional entries as missing", () => {
      // OPT is optional — operator may have set it to nothing.
      const result = auditEnvSpec({
        spec,
        referenced: new Set(["FOO", "BAR", "OPT"]),
        deployedEnv: new Set(["FOO"]),
        deploymentTarget: "production",
      });
      expect(result.missingFromDeployment).toEqual([]);
    });

    it("flags names in the deployment that have no spec entry (stale env)", () => {
      // 2026-05-12: a `SYNC_STORAGE=memory` left over from a long-deleted
      // branch silently routed PUTs to memory. A name in Vercel that
      // nobody documented is a smell even if it's harmless today.
      const result = auditEnvSpec({
        spec,
        referenced: new Set(["FOO", "BAR", "OPT"]),
        deployedEnv: new Set(["FOO", "OPT", "GHOST_FROM_OLD_BRANCH"]),
        deploymentTarget: "production",
      });
      expect(result.undocumentedInDeployment).toEqual(["GHOST_FROM_OLD_BRANCH"]);
    });
  });

  it("isClean returns true only when every bucket is empty", () => {
    const result = auditEnvSpec({
      spec,
      referenced: new Set(["FOO", "BAR", "OPT"]),
    });
    expect(result.isClean).toBe(true);

    const dirty = auditEnvSpec({
      spec,
      referenced: new Set(["NEW_UNDOCUMENTED"]),
    });
    expect(dirty.isClean).toBe(false);
  });
});
