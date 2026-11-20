/**
 * Structural pins for following the device's text size. happy-dom
 * computes no layout, so these read the stylesheet itself.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.resolve(__dirname, "../../src/index.css"), "utf8");

describe("system text size in the stylesheet", () => {
  it("scales the root size by the device's text scale, from the 14px chrome size", () => {
    const html = css.match(/\n {4}html\s*\{[^}]*\}/)?.[0] ?? "";
    expect(html).toContain("font-size: calc(14px * var(--system-text-scale, 1))");
    expect(html).not.toMatch(/font-size:\s*14px;/);
  });

  // Pin: reading text (article body, list rows) starts from the device's
  // full size, 16px at the default, while menus and controls keep the
  // denser 14px ratio. A reader found reading text small at 14px.
  it("gives reading text the device's full size as its base", () => {
    expect(css).toContain("--reading-base: calc(16px * var(--system-text-scale, 1))");
  });

  it("defines the four reading sizes as steps from that base", () => {
    for (const [name, factor] of [
      ["small", "0.875"],
      ["medium", "1"],
      ["large", "1.125"],
      ["x-large", "1.25"],
    ]) {
      const rule = css.match(new RegExp(`\\.reading-size-${name}\\s*\\{[^}]*\\}`))?.[0] ?? "";
      expect(rule, name).toContain(`calc(var(--reading-base) * ${factor})`);
    }
  });
});
