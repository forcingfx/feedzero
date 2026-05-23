import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSmartFilterStore } from "../../src/stores/smart-filter-store.ts";
import { useSyncStore } from "../../src/stores/sync-store.ts";
import { useLicenseStore } from "../../src/stores/license-store.ts";
import { isSelfHosted } from "../../src/core/features/self-hosted.ts";
import { isPaidTierActive } from "../../src/core/features/paid-tier-active.ts";
import type { ConditionGroup } from "@feedzero/core/types";

vi.mock("../../src/core/features/self-hosted.ts", () => ({
  isSelfHosted: vi.fn(() => false),
}));
vi.mock("../../src/core/features/paid-tier-active.ts", () => ({
  isPaidTierActive: vi.fn(() => true),
}));

vi.mock("../../src/core/storage/db.ts", () => ({
  getSmartFilters: vi.fn(),
  addSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  updateSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
  removeSmartFilter: vi.fn().mockResolvedValue({ ok: true, value: true }),
}));

vi.mock("../../src/core/sync/sync-service", () => ({
  pushVault: vi.fn().mockResolvedValue({ ok: true, value: Date.now() }),
  pullVault: vi.fn(),
  importVault: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: vi.fn() }));

import {
  getSmartFilters,
  addSmartFilter,
  updateSmartFilter,
  removeSmartFilter,
} from "../../src/core/storage/db.ts";

const emptyRule: ConditionGroup = { kind: "group", match: "all", children: [] };

describe("smart-filter-store", () => {
  beforeEach(() => {
    useSmartFilterStore.setState({ filters: [], isLoading: false });
    useLicenseStore.setState({ tier: "personal", verifying: false });
    vi.mocked(isSelfHosted).mockReturnValue(false);
    vi.mocked(isPaidTierActive).mockReturnValue(true);
    vi.clearAllMocks();
    vi.mocked(addSmartFilter).mockResolvedValue({ ok: true, value: true });
    vi.mocked(updateSmartFilter).mockResolvedValue({ ok: true, value: true });
    vi.mocked(removeSmartFilter).mockResolvedValue({ ok: true, value: true });
  });

  describe("loadFilters", () => {
    it("populates from the DB", async () => {
      vi.mocked(getSmartFilters).mockResolvedValue({
        ok: true,
        value: [
          {
            id: "1",
            name: "Tech",
            rule: emptyRule,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      });

      await useSmartFilterStore.getState().loadFilters();

      expect(useSmartFilterStore.getState().filters).toHaveLength(1);
      expect(useSmartFilterStore.getState().filters[0].name).toBe("Tech");
    });

    it("leaves filters empty on db error", async () => {
      vi.mocked(getSmartFilters).mockResolvedValue({
        ok: false,
        error: "boom",
      });

      await useSmartFilterStore.getState().loadFilters();

      expect(useSmartFilterStore.getState().filters).toEqual([]);
    });
  });

  describe("createFilter", () => {
    it("persists, reloads, and schedules sync push when the gate is open", async () => {
      const scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");
      vi.mocked(getSmartFilters).mockResolvedValue({ ok: true, value: [] });

      const result = await useSmartFilterStore.getState().createFilter({
        name: "Recent AI",
        rule: emptyRule,
      });

      expect(result.ok).toBe(true);
      expect(addSmartFilter).toHaveBeenCalled();
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("rejects when the user is gate-locked (free tier, paid active)", async () => {
      useLicenseStore.setState({ tier: "free", verifying: false });

      const result = await useSmartFilterStore.getState().createFilter({
        name: "Recent AI",
        rule: emptyRule,
      });

      expect(result.ok).toBe(false);
      expect(addSmartFilter).not.toHaveBeenCalled();
    });

    it("rejects an empty name (delegates to createSmartFilter validation)", async () => {
      const result = await useSmartFilterStore
        .getState()
        .createFilter({ name: "  ", rule: emptyRule });

      expect(result.ok).toBe(false);
      expect(addSmartFilter).not.toHaveBeenCalled();
    });
  });

  describe("updateFilter", () => {
    it("persists changes, bumps updatedAt, schedules sync push", async () => {
      const original = {
        id: "f1",
        name: "Old",
        rule: emptyRule,
        createdAt: 1,
        updatedAt: 1,
      };
      useSmartFilterStore.setState({ filters: [original] });
      vi.mocked(getSmartFilters).mockResolvedValue({
        ok: true,
        value: [{ ...original, name: "New", updatedAt: 999 }],
      });
      const scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");

      const result = await useSmartFilterStore
        .getState()
        .updateFilter({ ...original, name: "New" });

      expect(result.ok).toBe(true);
      expect(updateSmartFilter).toHaveBeenCalled();
      const persisted = vi.mocked(updateSmartFilter).mock.calls[0][0];
      expect(persisted.name).toBe("New");
      expect(persisted.updatedAt).toBeGreaterThan(1);
      expect(scheduleSpy).toHaveBeenCalled();
    });

    it("is gate-enforced", async () => {
      useLicenseStore.setState({ tier: "free", verifying: false });
      const result = await useSmartFilterStore.getState().updateFilter({
        id: "x",
        name: "x",
        rule: emptyRule,
        createdAt: 1,
        updatedAt: 1,
      });
      expect(result.ok).toBe(false);
      expect(updateSmartFilter).not.toHaveBeenCalled();
    });
  });

  describe("removeFilter", () => {
    it("removes from db, reloads, schedules sync push", async () => {
      vi.mocked(getSmartFilters).mockResolvedValue({ ok: true, value: [] });
      const scheduleSpy = vi.spyOn(useSyncStore.getState(), "scheduleSyncPush");

      await useSmartFilterStore.getState().removeFilter("f1");

      expect(removeSmartFilter).toHaveBeenCalledWith("f1");
      expect(scheduleSpy).toHaveBeenCalled();
    });
  });

  describe("duplicateFilter", () => {
    it("clones an existing filter with a new id and ' (copy)' suffix", async () => {
      const src = {
        id: "src",
        name: "Recent AI",
        rule: emptyRule,
        createdAt: 1,
        updatedAt: 1,
      };
      useSmartFilterStore.setState({ filters: [src] });
      vi.mocked(getSmartFilters).mockResolvedValue({
        ok: true,
        value: [src],
      });

      const result = await useSmartFilterStore
        .getState()
        .duplicateFilter("src");

      expect(result.ok).toBe(true);
      expect(addSmartFilter).toHaveBeenCalled();
      if (!result.ok) return;
      expect(result.value.id).not.toBe("src");
      expect(result.value.name).toBe("Recent AI (copy)");
    });

    it("returns err when the source filter is missing", async () => {
      useSmartFilterStore.setState({ filters: [] });
      const result = await useSmartFilterStore
        .getState()
        .duplicateFilter("missing");
      expect(result.ok).toBe(false);
    });
  });
});
