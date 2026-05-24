import { describe, it, expect } from "vitest";
import {
  DB_NAME,
  DB_VERSION,
  CRYPTO,
  PBKDF2_PRODUCTION_ITERATIONS,
  SCHEMA_VERSION,
  LOCAL_STORAGE,
  ALL_FEEDS_ID,
  FOLDER_FEED_PREFIX,
  toFolderFeedId,
  fromFolderFeedId,
  isFolderFeedId,
  isAggregatedFeedId,
} from "@feedzero/core/utils/constants";

describe("Constants", () => {
  it("should define database config", () => {
    expect(DB_NAME).toBe("feedzero");
    expect(DB_VERSION).toBe(8);
  });

  it("should define crypto params with secure defaults", () => {
    expect(CRYPTO.ALGORITHM).toBe("AES-GCM");
    expect(CRYPTO.KEY_LENGTH).toBe(256);
  });

  it("keeps the production PBKDF2 iteration count at the OWASP floor", () => {
    expect(PBKDF2_PRODUCTION_ITERATIONS).toBeGreaterThanOrEqual(600_000);
  });

  it("lowers the runtime PBKDF2 count under the test runner so the crypto suite stays fast", () => {
    // Round-trip correctness is independent of the iteration count; only
    // production security depends on the OWASP floor. The Vitest runner
    // therefore derives keys with a far smaller count. This test runs under
    // Vitest, so the active count must be below the production floor.
    expect(CRYPTO.PBKDF2_ITERATIONS).toBeLessThan(PBKDF2_PRODUCTION_ITERATIONS);
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

  describe("folder feed id helpers", () => {
    it("toFolderFeedId prefixes the folder id", () => {
      expect(toFolderFeedId("abc-123")).toBe(`${FOLDER_FEED_PREFIX}abc-123`);
    });

    it("isFolderFeedId detects the folder prefix", () => {
      expect(isFolderFeedId("folder:abc")).toBe(true);
      expect(isFolderFeedId("abc")).toBe(false);
      expect(isFolderFeedId(ALL_FEEDS_ID)).toBe(false);
    });

    it("fromFolderFeedId extracts the folder id, or null for non-folder ids", () => {
      expect(fromFolderFeedId("folder:abc-123")).toBe("abc-123");
      expect(fromFolderFeedId("abc")).toBeNull();
      expect(fromFolderFeedId(ALL_FEEDS_ID)).toBeNull();
    });

    it("isAggregatedFeedId is true for ALL_FEEDS_ID and folder ids, false otherwise", () => {
      expect(isAggregatedFeedId(ALL_FEEDS_ID)).toBe(true);
      expect(isAggregatedFeedId("folder:abc")).toBe(true);
      expect(isAggregatedFeedId("feed-uuid")).toBe(false);
    });
  });
});
