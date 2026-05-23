import { describe, it, expect } from "vitest";
import { createMemoryAdapter } from "@/core/sync/adapters/memory-adapter";
import { isOk, unwrap } from "@feedzero/core/utils/result";

describe("memory-adapter", () => {
  it("returns null for a missing vault", async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.get("abc123");
    expect(isOk(result)).toBe(true);
    expect(unwrap(result)).toBeNull();
  });

  it("stores and retrieves a vault", async () => {
    const adapter = createMemoryAdapter();
    const data = '{"version":1,"iv":[1,2,3],"ciphertext":"abc"}';

    const putResult = await adapter.put("vault-id-1", data);
    expect(isOk(putResult)).toBe(true);

    const getResult = await adapter.get("vault-id-1");
    expect(isOk(getResult)).toBe(true);
    expect(unwrap(getResult)).toBe(data);
  });

  it("overwrites an existing vault", async () => {
    const adapter = createMemoryAdapter();
    await adapter.put("vault-id-1", "first");
    await adapter.put("vault-id-1", "second");

    const result = await adapter.get("vault-id-1");
    expect(unwrap(result)).toBe("second");
  });

  it("keeps multiple vaults independent", async () => {
    const adapter = createMemoryAdapter();
    await adapter.put("vault-a", "data-a");
    await adapter.put("vault-b", "data-b");

    expect(unwrap(await adapter.get("vault-a"))).toBe("data-a");
    expect(unwrap(await adapter.get("vault-b"))).toBe("data-b");
  });

  it("each adapter instance has isolated storage", async () => {
    const adapter1 = createMemoryAdapter();
    const adapter2 = createMemoryAdapter();

    await adapter1.put("vault-1", "data");
    expect(unwrap(await adapter2.get("vault-1"))).toBeNull();
  });

  it("deletes an existing vault", async () => {
    const adapter = createMemoryAdapter();
    await adapter.put("vault-del", "data");

    const result = await adapter.delete("vault-del");
    expect(isOk(result)).toBe(true);
    expect(unwrap(await adapter.get("vault-del"))).toBeNull();
  });

  it("delete returns ok for a non-existent vault", async () => {
    const adapter = createMemoryAdapter();
    const result = await adapter.delete("no-such-vault");
    expect(isOk(result)).toBe(true);
  });
});
