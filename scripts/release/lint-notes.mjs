// Pure house-style checks for release-notes bullets. No I/O.
//
// The /release skill auto-fixes `fixable` violations (append a period, turn
// em-dashes into commas, strip exclamation marks) and ABORTS on the rest
// (lowercase start, emoji, marketing verbs) so a clumsy auto-drafted line
// can never reach users' "What's new" feed unattended.
const BANNED = [
  "seamlessly",
  "effortlessly",
  "revolutionary",
  "game-chang",
  "blazing",
  "delightful",
  "magical",
  "cutting-edge",
  "best-in-class",
  "powerful",
];
const EMOJI =
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE00}-\u{FE0F}]/u;

export function lintBullet(text) {
  const v = [];
  if (!/^[A-Z]/.test(text)) v.push({ rule: "capitalized-start", fixable: false });
  if (!/[.]$/.test(text)) v.push({ rule: "ends-with-period", fixable: true });
  if (/—/.test(text)) v.push({ rule: "no-em-dash", fixable: true });
  if (/!/.test(text)) v.push({ rule: "no-exclamation", fixable: true });
  if (EMOJI.test(text)) v.push({ rule: "no-emoji", fixable: false });
  if (BANNED.some((w) => text.toLowerCase().includes(w))) {
    v.push({ rule: "no-marketing-verb", fixable: false });
  }
  return v;
}

export function lintNotes(entry) {
  const out = [];
  for (const field of ["added", "changed", "fixed", "removed"]) {
    (entry[field] ?? []).forEach((text, index) => {
      for (const v of lintBullet(text)) out.push({ field, index, ...v });
    });
  }
  return out;
}
