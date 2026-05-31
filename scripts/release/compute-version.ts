// Pure semver logic from conventional-commit subject lines. No I/O.
//
// Used by the /release skill to derive the next version automatically:
//   feat!/BREAKING CHANGE -> major, feat -> minor, fix/perf -> patch,
//   nothing releasable -> null (the skill aborts with "nothing to release").

export type Bump = "major" | "minor" | "patch";

export interface ParsedCommit {
  type: string | null;
  scope: string | null;
  breaking: boolean;
  description: string;
}

const RELEASE_BUMP: Record<string, Bump> = { feat: "minor", fix: "patch", perf: "patch" };

export function parseConventional(subject: string): ParsedCommit {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/s.exec(subject.trim());
  if (!m) {
    return { type: null, scope: null, breaking: false, description: subject.trim() };
  }
  const [, type, scope, bang, description] = m;
  return {
    type,
    scope: scope ?? null,
    breaking: Boolean(bang) || /BREAKING CHANGE/.test(subject),
    description: description.trim(),
  };
}

export function computeBump(subjects: string[]): Bump | null {
  let bump: Bump | null = null;
  for (const s of subjects) {
    const c = parseConventional(s);
    if (c.breaking) return "major";
    const b = c.type ? RELEASE_BUMP[c.type] : undefined;
    if (b === "minor") bump = "minor";
    else if (b === "patch" && bump !== "minor") bump = "patch";
  }
  return bump;
}

export function nextVersion(last: string, bump: Bump | null): string | null {
  const [maj, min, pat] = last.split(".").map(Number);
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  if (bump === "patch") return `${maj}.${min}.${pat + 1}`;
  return null;
}

export function computeVersion(last: string, subjects: string[]): string | null {
  return nextVersion(last, computeBump(subjects));
}
