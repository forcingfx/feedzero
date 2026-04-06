import { describe, it, expect } from "vitest";
import {
  DB_NAME,
  DB_VERSION,
  CRYPTO,
  SCHEMA_VERSION,
  LOCAL_STORAGE,
  ALL_FEEDS_ID,
} from "../../src/utils/constants.ts";

describe("Constants", () => {
  it("should define database config", () => {
    expect(DB_NAME).toBe("feedzero");
    expect(DB_VERSION).toBe(4);
  });

  it("should define crypto params with secure defaults", () => {
    expect(CRYPTO.ALGORITHM).toBe("AES-GCM");
    expect(CRYPTO.KEY_LENGTH).toBe(256);
    expect(CRYPTO.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("should define schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  it("should define localStorage keys", () => {
    expect(LOCAL_STORAGE.ONBOARDING_COMPLETE).toBe(
      "feedzero:onboarding-complete",
    );
    expect(LOCAL_STORAGE.STORAGE_MODE).toBe("feedzero:storage-mode");
  });

  it("should define ALL_FEEDS_ID for global feed view", () => {
    expect(ALL_FEEDS_ID).toBe("all");
  });
});
