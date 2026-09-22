import { describe, it, expect } from "vitest";
import { SYNC } from "@feedzero/core/utils/constants";
import {
  measureVaultHeadroom,
  formatMegabytes,
} from "@/core/sync/vault-headroom";

const LIMIT = SYNC.MAX_PUSH_BODY_SIZE;

describe("vault headroom", () => {
  it("is quiet while there is room", () => {
    expect(measureVaultHeadroom(LIMIT * 0.5).level).toBe("ok");
  });

  it("warns before the wall, not at it", () => {
    // The point of the warning is that a user sees it coming while they
    // can still do something. A warning that fires at 100% is a failure
    // report, not a warning.
    expect(measureVaultHeadroom(LIMIT * 0.85).level).toBe("warn");
  });

  it("reports a vault at the limit as full", () => {
    expect(measureVaultHeadroom(LIMIT).level).toBe("full");
    expect(measureVaultHeadroom(LIMIT * 1.4).level).toBe("full");
  });

  it("never claims more than 100% used", () => {
    expect(measureVaultHeadroom(LIMIT * 3).percentUsed).toBe(100);
  });

  it("labels sizes the way the sync error does", () => {
    // One formatter for both surfaces: a Settings panel saying 3.2 MB
    // beside an error saying 3.4 MB for the same vault is a support
    // ticket.
    const headroom = measureVaultHeadroom(3.25 * 1024 * 1024);
    expect(headroom.usedLabel).toBe("3.3 MB");
    expect(headroom.limitLabel).toBe(formatMegabytes(LIMIT));
  });
});
