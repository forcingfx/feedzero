export const FOLDER_COLORS = [
  "#7c3aed", // violet
  "#2563eb", // blue
  "#0891b2", // cyan
  "#059669", // emerald
  "#d97706", // amber
  "#dc2626", // red
  "#db2777", // pink
  "#64748b", // slate
] as const;

/**
 * Picks the next color for a new folder. Prefers the first unused color from
 * the palette so the first 8 folders all get distinct colors; once every color
 * is in use, falls back to a deterministic rotation by the existing folder count.
 */
export function pickNextFolderColor(existingColors: (string | undefined)[]): string {
  const used = new Set(existingColors.filter(Boolean) as string[]);
  const unused = FOLDER_COLORS.find((c) => !used.has(c));
  if (unused) return unused;
  return FOLDER_COLORS[existingColors.length % FOLDER_COLORS.length];
}
