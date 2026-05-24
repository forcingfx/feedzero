import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import {
  open,
  close,
  deleteDatabase,
} from "../../../src/core/storage/db.ts";
import {
  getAnthropicKey,
  setAnthropicKey,
  clearAnthropicKey,
} from "../../../src/core/storage/secrets.ts";

describe("secrets — Anthropic API key (encrypted at rest, synced)", () => {
  beforeEach(async () => {
    await deleteDatabase();
    const opened = await open("correct-horse-battery-staple");
    expect(opened.ok).toBe(true);
  });

  afterEach(() => {
    close();
  });

  it("getAnthropicKey returns null before anything is stored", async () => {
    const result = await getAnthropicKey();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it("setAnthropicKey persists a key that getAnthropicKey reads back", async () => {
    const stored = await setAnthropicKey("sk-ant-test-1234");
    expect(stored.ok).toBe(true);

    const fetched = await getAnthropicKey();
    expect(fetched.ok).toBe(true);
    if (!fetched.ok) return;
    expect(fetched.value).toBe("sk-ant-test-1234");
  });

  it("setAnthropicKey overwrites a previously-stored key", async () => {
    await setAnthropicKey("sk-ant-old");
    await setAnthropicKey("sk-ant-new");

    const fetched = await getAnthropicKey();
    if (!fetched.ok) throw new Error("getAnthropicKey failed");
    expect(fetched.value).toBe("sk-ant-new");
  });

  it("clearAnthropicKey removes the stored key", async () => {
    await setAnthropicKey("sk-ant-bye");
    const cleared = await clearAnthropicKey();
    expect(cleared.ok).toBe(true);

    const fetched = await getAnthropicKey();
    if (!fetched.ok) throw new Error("getAnthropicKey failed");
    expect(fetched.value).toBeNull();
  });

  it("rejects empty and whitespace-only keys (would silently auth-fail)", async () => {
    const empty = await setAnthropicKey("");
    expect(empty.ok).toBe(false);

    const whitespace = await setAnthropicKey("   ");
    expect(whitespace.ok).toBe(false);
  });

  it("trims surrounding whitespace from the stored key", async () => {
    await setAnthropicKey("  sk-ant-padded  ");
    const fetched = await getAnthropicKey();
    if (!fetched.ok) throw new Error("getAnthropicKey failed");
    expect(fetched.value).toBe("sk-ant-padded");
  });

  it("key survives close + reopen with the same passphrase", async () => {
    await setAnthropicKey("sk-ant-persistent");

    close();

    const reopened = await open("correct-horse-battery-staple");
    expect(reopened.ok).toBe(true);

    const fetched = await getAnthropicKey();
    if (!fetched.ok) throw new Error("getAnthropicKey after reopen failed");
    expect(fetched.value).toBe("sk-ant-persistent");
  });
});
