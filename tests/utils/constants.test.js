import { describe, it, expect } from "vitest";
import {
  DB_NAME,
  DB_VERSION,
  CRYPTO,
  EVENTS,
  SCHEMA_VERSION,
} from "../../src/utils/constants.js";

describe("Constants", () => {
  it("should define database config", () => {
    expect(DB_NAME).toBe("feedzero");
    expect(DB_VERSION).toBe(1);
  });

  it("should define crypto params with secure defaults", () => {
    expect(CRYPTO.ALGORITHM).toBe("AES-GCM");
    expect(CRYPTO.KEY_LENGTH).toBe(256);
    expect(CRYPTO.PBKDF2_ITERATIONS).toBeGreaterThanOrEqual(100_000);
  });

  it("should define all required event names", () => {
    expect(EVENTS.FEED_ADDED).toBeDefined();
    expect(EVENTS.FEED_SELECTED).toBeDefined();
    expect(EVENTS.ARTICLE_SELECTED).toBeDefined();
    expect(EVENTS.STORAGE_READY).toBeDefined();
  });

  it("should define schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
