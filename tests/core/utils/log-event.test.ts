import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logEvent, sizeBucket } from "@feedzero/core/utils/log-event";

describe("sizeBucket", () => {
  it("reports a coarse bucket, never the exact size", () => {
    // The bucket is the privacy boundary. An exact byte count on every
    // push is a per-user size series in the operator's logs, which is
    // the behavioural telemetry the product promises not to collect; a
    // power-of-two bucket answers "are vaults getting bigger" without
    // answering "how big is this person's".
    expect(sizeBucket(700_000)).toBe("<=1MB");
    expect(sizeBucket(1_500_000)).toBe("<=2MB");
  });

  it("puts anything past the ceiling in one bucket", () => {
    expect(sizeBucket(9 * 1024 * 1024)).toBe(">4MB");
  });

  it("puts the smallest vaults in the floor bucket", () => {
    expect(sizeBucket(12)).toBe("<=64KB");
  });
});

describe("logEvent", () => {
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLog.mockRestore();
  });

  it("writes a single line of JSON, separate from the error log", () => {
    // console.log, not console.error: a routine size sample is not an
    // ops event, and mixing the two inflates the error log that
    // on-call actually reads.
    logEvent({
      route: "/api/sync",
      method: "PUT",
      event: "vault.put",
      sizeBucket: "<=2MB",
      encoding: "gzip",
    });

    expect(consoleLog).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(consoleLog.mock.calls[0][0] as string);
    expect(parsed.event).toBe("vault.put");
    expect(parsed.sizeBucket).toBe("<=2MB");
    expect(parsed.ts).toBeTruthy();
  });

  it("drops anything not on the allow-list, even when types are bypassed", () => {
    // Same defensive pick as logError. The type is the allow-list, and
    // this is what holds when a caller reaches for `any`.
    logEvent({
      route: "/api/sync",
      method: "PUT",
      event: "vault.put",
      sizeBucket: "<=2MB",
      encoding: "gzip",
      vaultId: "a".repeat(64),
      ip: "203.0.113.4",
    } as unknown as Parameters<typeof logEvent>[0]);

    const parsed = JSON.parse(consoleLog.mock.calls[0][0] as string);
    expect(parsed.vaultId).toBeUndefined();
    expect(parsed.ip).toBeUndefined();
  });
});
