// Pure: conventional-commit subjects -> a releases.mjs entry object. No I/O.
//
// Maps commit types to Keep-a-Changelog sections, rewrites each subject to a
// verb-led past-tense sentence in the landing house style, and derives a
// title/subtitle. The result is editable after the fact (entry IDs are
// preserved by build-releases.mjs), so an imperfect auto-title is fine.
import { parseConventional } from "./compute-version.mjs";

const SECTION_BY_TYPE = { feat: "added", fix: "fixed", perf: "changed", refactor: "changed" };

export function toHouseStyle(description) {
  let s = description.trim().replace(/\s*—\s*/g, ", ").replace(/!+/g, "");
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (!/[.]$/.test(s)) s += ".";
  return s;
}

export function draftNotes(subjects, { version, date }) {
  const buckets = { added: [], changed: [], fixed: [] };
  for (const subj of subjects) {
    const parsed = parseConventional(subj);
    const section = SECTION_BY_TYPE[parsed.type];
    if (!section) continue; // chore/docs/test/ci/build/style are not user-facing
    buckets[section].push(toHouseStyle(parsed.description));
  }
  const lead =
    buckets.added[0] ?? buckets.changed[0] ?? buckets.fixed[0] ?? "Maintenance release.";
  const counts = [];
  for (const k of ["added", "changed", "fixed"]) {
    if (buckets[k].length) counts.push(`${buckets[k].length} ${k}`);
  }
  const entry = {
    version,
    date,
    title: lead.replace(/\.$/, ""),
    subtitle: counts.join(", ") + ".",
  };
  for (const k of ["added", "changed", "fixed"]) {
    if (buckets[k].length) entry[k] = buckets[k];
  }
  return entry;
}
