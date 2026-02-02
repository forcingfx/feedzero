import { describe, it, expect } from "vitest";
import { validateProxyUrl } from "@/core/proxy/validate-url";
import { unwrap } from "@/utils/result";

function expectErr(result: { ok: boolean }) {
  expect(result.ok).toBe(false);
  return result as { ok: false; error: string };
}

describe("validateProxyUrl", () => {
  it("returns ok for a valid https URL", () => {
    const result = validateProxyUrl("https://example.com/feed.xml");
    expect(result.ok).toBe(true);
    expect(unwrap(result).href).toBe("https://example.com/feed.xml");
  });

  it("returns ok for a valid http URL", () => {
    const result = validateProxyUrl("http://example.com/feed.xml");
    expect(result.ok).toBe(true);
  });

  it("returns error when url is missing", () => {
    const result = expectErr(validateProxyUrl(null));
    expect(result.error).toBe("Missing url parameter");
  });

  it("returns error when url is empty string", () => {
    const result = expectErr(validateProxyUrl(""));
    expect(result.error).toBe("Missing url parameter");
  });

  it("returns error for non-http protocol (ftp)", () => {
    const result = expectErr(validateProxyUrl("ftp://example.com/feed.xml"));
    expect(result.error).toBe("Only http and https URLs are allowed");
  });

  it("returns error for javascript: protocol", () => {
    expectErr(validateProxyUrl("javascript:alert(1)"));
  });

  it("returns error for file: protocol", () => {
    expectErr(validateProxyUrl("file:///etc/passwd"));
  });

  describe("SSRF protections", () => {
    it("blocks localhost", () => {
      const result = expectErr(validateProxyUrl("http://localhost/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 127.0.0.1", () => {
      const result = expectErr(validateProxyUrl("http://127.0.0.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks ::1 (IPv6 loopback)", () => {
      const result = expectErr(validateProxyUrl("http://[::1]/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 0.0.0.0", () => {
      const result = expectErr(validateProxyUrl("http://0.0.0.0/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 10.x.x.x (class A private)", () => {
      const result = expectErr(validateProxyUrl("http://10.0.0.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 192.168.x.x (class C private)", () => {
      const result = expectErr(validateProxyUrl("http://192.168.1.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 172.16.x.x (class B private)", () => {
      const result = expectErr(validateProxyUrl("http://172.16.0.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 169.254.169.254 (cloud metadata)", () => {
      const result = expectErr(
        validateProxyUrl("http://169.254.169.254/latest/meta-data/"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });
  });

  it("returns error for malformed URL", () => {
    expectErr(validateProxyUrl("not-a-url"));
  });
});
