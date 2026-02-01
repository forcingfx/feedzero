import { marked } from "marked";
import { sanitize } from "../parser/sanitizer.ts";

/**
 * Convert a markdown string to sanitized HTML.
 * Uses marked for parsing and DOMPurify for XSS protection.
 */
export function markdownToHtml(md: string): string {
  if (!md || typeof md !== "string") return "";
  const raw = marked.parse(md, { async: false }) as string;
  return sanitize(raw);
}
