import { describe, expect, it } from "vitest";
import { visibleTextLength } from "@/core/extractor/paywall-detectors/visible-text.ts";

describe("visibleTextLength", () => {
  it("returns 0 for empty input", () => {
    expect(visibleTextLength("")).toBe(0);
  });

  it("counts visible characters between tags", () => {
    expect(visibleTextLength("<p>hello world</p>")).toBe(11);
  });

  it("strips simple <script> blocks", () => {
    const html = "<p>visible</p><script>const malicious = 'noise';</script>";
    expect(visibleTextLength(html)).toBe("visible".length);
  });

  it("strips <script> blocks whose closing tag has whitespace (CodeQL js/bad-tag-filter regression guard)", () => {
    // CodeQL flagged the original regex because `</script>` did not match
    // `</script >`. If the regex regresses, the script body leaks into the
    // visible-text count and inflates length past the threshold.
    const html = "<p>x</p><script>const noise = '" + "y".repeat(2000) + "';</script >";
    expect(visibleTextLength(html)).toBe(1);
  });

  it("strips <script> blocks with newline before the closing >", () => {
    const html = "<p>x</p><script>console.log('a')</script\n>";
    expect(visibleTextLength(html)).toBe(1);
  });

  it("strips <script> blocks whose closing tag contains tabs, newlines and garbage text (CodeQL example)", () => {
    // CodeQL's exact example: </script\t\n bar>. A tolerant HTML parser
    // accepts this; the regex must too, or the script body leaks into the
    // length count.
    const html = "<p>x</p><script>const y = '" + "z".repeat(1500) + "';</script\t\n bar>";
    expect(visibleTextLength(html)).toBe(1);
  });

  it("does NOT mistake </scriptbar> for a closing tag (word-boundary guard)", () => {
    // The body contains the literal string "</scriptbar>" — not a closing
    // tag. The real closing tag comes next. The regex must keep matching
    // up to the real `</script>`.
    const html = "<p>x</p><script>var s = '</scriptbar>';</script>";
    expect(visibleTextLength(html)).toBe(1);
  });

  it("strips <style> blocks with whitespace in the closing tag", () => {
    const html =
      "<p>x</p><style>body{color:red;}" + "z".repeat(2000) + "</style\t>";
    expect(visibleTextLength(html)).toBe(1);
  });

  it("collapses runs of whitespace", () => {
    expect(visibleTextLength("<p>a   b\n\n\nc</p>")).toBe("a b c".length);
  });

  it("ignores html entities (counts the literal as one space)", () => {
    // &nbsp; is replaced by " " then collapsed; net effect: one char gap.
    const len = visibleTextLength("<p>a&nbsp;b</p>");
    expect(len).toBe("a b".length);
  });
});
