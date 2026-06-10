import { describe, expect, it } from "vitest";
import { StateStore, StateStoreError } from "../src/state/StateStore.js";

type TestState = {
  count: number;
  label?: string;
};

const scope = { tenantId: "tenant-a", userId: "user-a" };

export function describeStateStoreContract(
  name: string,
  createStore: (clock: { now: Date }) => StateStore<TestState>
) {
  describe(`${name} StateStore contract`, () => {
    it("creates opaque prefixed handles and looks records up by scope", async () => {
      const store = createStore({ now: new Date("2026-01-01T00:00:00Z") });
      const record = await store.create({
        type: "example",
        handlePrefix: "example",
        scope,
        ttlMs: 60_000,
        value: { count: 1 }
      });

      expect(record.handle).toMatch(/^example_[A-Za-z0-9_-]{20,}$/);
      expect(record.version).toBe(1);
      await expect(store.get(record.handle, scope)).resolves.toMatchObject({
        handle: record.handle,
        value: { count: 1 }
      });
    });

    it("patches with optimistic concurrency", async () => {
      const store = createStore({ now: new Date("2026-01-01T00:00:00Z") });
      const record = await store.create({
        type: "example",
        scope,
        ttlMs: 60_000,
        value: { count: 1 }
      });

      const updated = await store.patch(
        record.handle,
        scope,
        { count: 2, label: "updated" },
        { expectedVersion: 1 }
      );

      expect(updated.version).toBe(2);
      expect(updated.value).toEqual({ count: 2, label: "updated" });
      await expect(
        store.patch(record.handle, scope, { count: 3 }, { expectedVersion: 1 })
      ).rejects.toMatchObject({ code: "version_conflict" });
    });

    it("rejects cross-scope access", async () => {
      const store = createStore({ now: new Date("2026-01-01T00:00:00Z") });
      const record = await store.create({
        type: "example",
        scope,
        ttlMs: 60_000,
        value: { count: 1 }
      });

      await expect(
        store.get(record.handle, { tenantId: "tenant-b", userId: "user-a" })
      ).rejects.toMatchObject({ code: "forbidden" });
    });

    it("returns null for missing records", async () => {
      const store = createStore({ now: new Date("2026-01-01T00:00:00Z") });
      await expect(store.get("example_missing", scope)).resolves.toBeNull();
    });

    it("rejects expired records", async () => {
      const clock = { now: new Date("2026-01-01T00:00:00Z") };
      const store = createStore(clock);
      const record = await store.create({
        type: "example",
        scope,
        ttlMs: 1_000,
        value: { count: 1 }
      });

      clock.now = new Date("2026-01-01T00:00:02Z");
      await expect(store.get(record.handle, scope)).rejects.toMatchObject({ code: "expired" });
      await expect(store.patch(record.handle, scope, { count: 2 })).rejects.toMatchObject({
        code: "expired"
      });
    });

    it("expires records explicitly", async () => {
      const clock = { now: new Date("2026-01-01T00:00:00Z") };
      const store = createStore(clock);
      const record = await store.create({
        type: "example",
        scope,
        ttlMs: 60_000,
        value: { count: 1 }
      });

      await store.expire(record.handle, scope);
      await expect(store.get(record.handle, scope)).rejects.toBeInstanceOf(StateStoreError);
      await expect(store.get(record.handle, scope)).rejects.toMatchObject({ code: "expired" });
    });
  });
}
