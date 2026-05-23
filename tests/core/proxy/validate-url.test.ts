import { describe, it, expect } from "vitest";
import { validateProxyUrl } from "@/core/proxy/validate-url";
import { unwrap } from "@feedzero/core/utils/result";

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

    it("blocks 172.17.x.x (Docker default bridge)", () => {
      const result = expectErr(validateProxyUrl("http://172.17.0.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 172.24.x.x (mid-range class B private)", () => {
      const result = expectErr(validateProxyUrl("http://172.24.0.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks 172.31.x.x (end of class B private range)", () => {
      const result = expectErr(validateProxyUrl("http://172.31.255.1/feed"));
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("allows 172.15.x.x (not in private range)", () => {
      const result = validateProxyUrl("http://172.15.0.1/feed");
      expect(result.ok).toBe(true);
    });

    it("allows 172.32.x.x (not in private range)", () => {
      const result = validateProxyUrl("http://172.32.0.1/feed");
      expect(result.ok).toBe(true);
    });

    it("blocks 169.254.169.254 (cloud metadata)", () => {
      const result = expectErr(
        validateProxyUrl("http://169.254.169.254/latest/meta-data/"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });
  });

  describe("SSRF bypass prevention", () => {
    it("blocks IPv6-mapped IPv4 loopback (::ffff:127.0.0.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://[::ffff:127.0.0.1]/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks IPv6-mapped private 10.x (::ffff:10.0.0.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://[::ffff:10.0.0.1]/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks IPv6-mapped private 192.168.x (::ffff:192.168.1.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://[::ffff:192.168.1.1]/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks IPv6-mapped metadata service (::ffff:169.254.169.254)", () => {
      const result = expectErr(
        validateProxyUrl("http://[::ffff:169.254.169.254]/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks decimal IP for loopback (2130706433)", () => {
      const result = expectErr(
        validateProxyUrl("http://2130706433/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks octal IP for loopback (0177.0.0.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://0177.0.0.1/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks hex IP for loopback (0x7f.0.0.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://0x7f000001/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("blocks IPv6-mapped 172.16.x (::ffff:172.16.0.1)", () => {
      const result = expectErr(
        validateProxyUrl("http://[::ffff:172.16.0.1]/feed"),
      );
      expect(result.error).toBe("Access to internal addresses is blocked");
    });

    it("allows IPv6-mapped public IP (::ffff:8.8.8.8)", () => {
      const result = validateProxyUrl("http://[::ffff:8.8.8.8]/feed");
      expect(result.ok).toBe(true);
    });
  });

  it("returns error for malformed URL", () => {
    expectErr(validateProxyUrl("not-a-url"));
  });
});
