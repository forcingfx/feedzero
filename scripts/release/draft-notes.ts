// Pure: conventional-commit subjects -> a releases.mjs entry object. No I/O.
//
// Maps commit types to Keep-a-Changelog sections, rewrites each subject to a
// verb-led past-tense sentence in the landing house style, and derives a
// title/subtitle. The result is editable after the fact (entry IDs are
// preserved by build-releases.mjs), so an imperfect auto-title is fine.
import { parseConventional } from "./compute-version.ts";

export interface ReleaseEntry {
  version: string;
  date: string;
  title: string;
  subtitle: string;
  added?: string[];
  changed?: string[];
  fixed?: string[];
  removed?: string[];
}

type Section = "added" | "changed" | "fixed";

const SECTION_BY_TYPE: Record<string, Section> = {
  feat: "added",
  fix: "fixed",
  perf: "changed",
  refactor: "changed",
};

export function toHouseStyle(description: string): string {
  let s = description.trim().replace(/\s*—\s*/g, ", ").replace(/!+/g, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.]$/.test(s)) s += ".";
  return s;
}

export function draftNotes(
  subjects: string[],
  { version, date }: { version: string; date: string },
): ReleaseEntry {
  const buckets: Record<Section, string[]> = { added: [], changed: [], fixed: [] };
  for (const subj of subjects) {
    const parsed = parseConventional(subj);
    const section = parsed.type ? SECTION_BY_TYPE[parsed.type] : undefined;
    if (!section) continue; // chore/docs/test/ci/build/style are not user-facing
    buckets[section].push(toHouseStyle(parsed.description));
  }
  const sections: Section[] = ["added", "changed", "fixed"];
  const lead =
    buckets.added[0] ?? buckets.changed[0] ?? buckets.fixed[0] ?? "Maintenance release.";
  const counts: string[] = [];
  for (const k of sections) if (buckets[k].length) counts.push(`${buckets[k].length} ${k}`);
  const entry: ReleaseEntry = {
    version,
    date,
    title: lead.replace(/\.$/, ""),
    subtitle: counts.join(", ") + ".",
  };
  for (const k of sections) if (buckets[k].length) entry[k] = buckets[k];
  return entry;
}
