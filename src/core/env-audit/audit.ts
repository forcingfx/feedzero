/**
 * Pure helpers behind the env audit script.
 *
 * Background: two production incidents (2026-05-12 sync regression,
 * 2026-05-14 stats-always-zero) traced to undocumented or stale env
 * variables in the Vercel project. The remediation calls for a checked-in
 * `expected-env.json` describing every env *name* the codebase reads, plus
 * a tool to compare the spec against a `vercel env pull` snapshot.
 *
 * This module owns the comparison logic and leaves I/O (reading source
 * files, reading `.env`, printing) to the script. Pure logic is unit-
 * testable without filesystem mocks; the script becomes a thin driver.
 */

/** Names that show up in source but are NOT deployment config. Filtered out. */
const TOOLING_NAMES = new Set<string>([
  "NODE_ENV",
  "VITEST",
  "ANALYZE",
]);

/**
 * Extract every env-variable name referenced from a source-code string.
 *
 * Recognises three reference forms used in the codebase:
 *  - `process.env.NAME`                — Node-server / serverless paths
 *  - `env.NAME`                        — destructured arg inside resolvers
 *  - `import.meta.env.NAME`            — Vite/SPA build-time replacement
 *
 * Returns lowercase-filter tooling names (NODE_ENV, VITEST, ANALYZE) so
 * the spec stays focused on deployment config the operator can set.
 */
export function scanEnvReferences(source: string): Set<string> {
  const found = new Set<string>();
  // `import.meta.env.NAME` — checked first so the leading `meta.env` chain
  // doesn't fall through to the generic `env.NAME` rule.
  const importMetaPattern = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
  for (const match of source.matchAll(importMetaPattern)) {
    found.add(match[1]);
  }
  // `process.env.NAME`
  const processPattern = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  for (const match of source.matchAll(processPattern)) {
    found.add(match[1]);
  }
  // Bare `env.NAME` — leading boundary so it doesn't match `process.env.X`
  // (already handled above) or `someother_env.X`.
  const bareEnvPattern = /(?:^|[^a-zA-Z0-9_.])env\.([A-Z][A-Z0-9_]*)/g;
  for (const match of source.matchAll(bareEnvPattern)) {
    found.add(match[1]);
  }
  for (const tooling of TOOLING_NAMES) {
    found.delete(tooling);
  }
  return found;
}

/**
 * Parse a `.env`-format file (the shape Vercel's `env pull` writes) and
 * return the set of key names. Values are intentionally ignored — the
 * spec only cares about which names are set, never the secret material.
 */
export function parseEnvFile(text: string): Set<string> {
  const names = new Set<string>();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    if (key) names.add(key);
  }
  return names;
}

export type Requirement = "production" | "self-host" | "optional";
export type DeploymentTarget = "production" | "self-host";

export interface EnvSpecEntry {
  required: Requirement;
  description: string;
  consumers?: string[];
}

export type EnvSpec = Record<string, EnvSpecEntry>;

export interface AuditInput {
  spec: EnvSpec;
  referenced: Set<string>;
  /** Names actually set in a pulled deployment env, when available. */
  deployedEnv?: Set<string>;
  /** Which deployment we're auditing the snapshot against. Default: "production". */
  deploymentTarget?: DeploymentTarget;
}

export interface AuditReport {
  /** Names in source but not in the spec. Source-of-truth: spec must catch up. */
  undocumented: string[];
  /** Names in the spec but not in source. Spec is stale. */
  unused: string[];
  /** Names the spec says are required for this target but the deployed env lacks. */
  missingFromDeployment: string[];
  /** Names set in the deployed env that aren't required for this target (eg. self-host-only in a Vercel env). */
  staleInDeployment: string[];
  /** Names set in the deployed env that the spec doesn't document at all. */
  undocumentedInDeployment: string[];
  /** True iff every bucket is empty. */
  isClean: boolean;
}

export function auditEnvSpec(input: AuditInput): AuditReport {
  const { spec, referenced, deployedEnv, deploymentTarget = "production" } =
    input;

  const specNames = new Set(Object.keys(spec));
  const undocumented = [...referenced]
    .filter((name) => !specNames.has(name))
    .sort();
  const unused = [...specNames]
    .filter((name) => !referenced.has(name))
    .sort();

  let missingFromDeployment: string[] = [];
  let staleInDeployment: string[] = [];
  let undocumentedInDeployment: string[] = [];

  if (deployedEnv) {
    missingFromDeployment = [...specNames]
      .filter((name) => {
        const entry = spec[name]!;
        if (entry.required !== deploymentTarget) return false;
        return !deployedEnv.has(name);
      })
      .sort();
    staleInDeployment = [...deployedEnv]
      .filter((name) => {
        const entry = spec[name];
        if (!entry) return false; // surface elsewhere as undocumentedInDeployment
        // Required for a DIFFERENT target means it shouldn't be set here.
        return (
          entry.required !== "optional" && entry.required !== deploymentTarget
        );
      })
      .sort();
    undocumentedInDeployment = [...deployedEnv]
      .filter((name) => !specNames.has(name))
      .sort();
  }

  const isClean =
    undocumented.length === 0 &&
    unused.length === 0 &&
    missingFromDeployment.length === 0 &&
    staleInDeployment.length === 0 &&
    undocumentedInDeployment.length === 0;

  return {
    undocumented,
    unused,
    missingFromDeployment,
    staleInDeployment,
    undocumentedInDeployment,
    isClean,
  };
}
