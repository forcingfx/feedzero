/**
 * Contract tests for the self-host CLI's TLS decision logic (issue #212).
 *
 * A reporter deploying on a LAN IP hit `SSL_ERROR_RX_RECORD_TOO_LONG`
 * because the default Caddyfile assumes a public FQDN and tries to fetch a
 * Let's Encrypt cert — which is impossible for an IP / localhost / .local
 * host. `scripts/feedzero` must classify the hostname and select the
 * internal-TLS Caddyfile (self-signed) for those cases.
 *
 * These run the real shell helpers (no Docker required — that's the point:
 * the decision must be verifiable without a running daemon).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";

const REPO = path.resolve(__dirname, "../..");
const LIB = path.join(REPO, "scripts/feedzero-lib.sh");
const CLI = path.join(REPO, "scripts/feedzero");

function lib(fn: string, host: string): string {
  return execFileSync("sh", ["-c", `. "${LIB}"; ${fn} "$1"`, "sh", host], {
    encoding: "utf8",
  }).trim();
}
const classify = (host: string) => lib("classify_hostname", host);
const caddyfileFor = (host: string) => lib("caddyfile_for_hostname", host);

function cliConfig(host: string): Record<string, string> {
  const out = execFileSync(CLI, ["config", host], { encoding: "utf8" });
  const map: Record<string, string> = {};
  for (const line of out.split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0) map[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return map;
}

describe("feedzero CLI hostname classification (#212)", () => {
  it("classifies an unset/placeholder hostname", () => {
    expect(classify("")).toBe("empty");
    expect(classify("feedzero.example.com")).toBe("example");
  });

  it("classifies IPv4 / IPv6 addresses as 'ip'", () => {
    expect(classify("192.168.1.42")).toBe("ip");
    expect(classify("10.0.0.5")).toBe("ip");
    expect(classify("[::1]")).toBe("ip");
    expect(classify("fe80::1")).toBe("ip");
  });

  it("classifies localhost and .local mDNS names as 'localhost'", () => {
    expect(classify("localhost")).toBe("localhost");
    expect(classify("reader.local")).toBe("localhost");
  });

  it("classifies a real public hostname as 'domain'", () => {
    expect(classify("reader.alice.dev")).toBe("domain");
    expect(classify("feedzero.example.org")).toBe("domain");
  });

  it("selects the internal-TLS Caddyfile for IP / localhost / .local", () => {
    expect(caddyfileFor("192.168.1.42")).toBe("./Caddyfile.lan");
    expect(caddyfileFor("localhost")).toBe("./Caddyfile.lan");
    expect(caddyfileFor("reader.local")).toBe("./Caddyfile.lan");
  });

  it("selects the public-FQDN Caddyfile for a real domain", () => {
    expect(caddyfileFor("reader.alice.dev")).toBe("./Caddyfile");
  });
});

describe("feedzero CLI `config` dry-run (no Docker required) (#212)", () => {
  it("reports internal TLS + Caddyfile.lan for an IP hostname", () => {
    const cfg = cliConfig("192.168.1.42");
    expect(cfg.HOSTNAME_CLASS).toBe("ip");
    expect(cfg.CADDYFILE).toBe("./Caddyfile.lan");
  });

  it("reports public ACME TLS + Caddyfile for a real domain", () => {
    const cfg = cliConfig("reader.alice.dev");
    expect(cfg.HOSTNAME_CLASS).toBe("domain");
    expect(cfg.CADDYFILE).toBe("./Caddyfile");
  });
});
