export const DB_NAME = "feedzero";
export const DB_VERSION = 1;

export const CRYPTO = {
  ALGORITHM: "AES-GCM",
  KEY_LENGTH: 256,
  IV_LENGTH: 12,
  SALT_LENGTH: 16,
  PBKDF2_ITERATIONS: 100_000,
  HASH: "SHA-256",
};

export const EVENTS = {
  FEED_ADDED: "feed:added",
  FEED_SELECTED: "feed:selected",
  FEED_REMOVED: "feed:removed",
  FEED_UPDATED: "feed:updated",
  ARTICLE_SELECTED: "article:selected",
  ARTICLE_READ: "article:read",
  STORAGE_READY: "storage:ready",
  STORAGE_ERROR: "storage:error",
  PARSE_ERROR: "parse:error",
};

export const SCHEMA_VERSION = 1;
