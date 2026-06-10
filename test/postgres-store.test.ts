import { describe, expect, it } from "vitest";
import { postgresSchema, PostgresStateStore } from "../src/state/postgresStore.js";
import { FakePostgresClient } from "./fakePostgres.js";
import { describeStateStoreContract } from "./state-store-contract.js";

describeStateStoreContract(
  "PostgresStateStore",
  (clock) =>
    new PostgresStateStore({
      tableName: "mcp_state",
      client: new FakePostgresClient(),
      now: () => clock.now
    })
);

describe("PostgresStateStore adapter errors and schema", () => {
  it("normalizes Postgres client failures", async () => {
    const client = new FakePostgresClient();
    client.failQueries = true;
    const store = new PostgresStateStore<{ count: number }>({
      tableName: "mcp_state",
      client
    });

    await expect(
      store.create({
        type: "example",
        scope: { tenantId: "tenant-a", userId: "user-a" },
        ttlMs: 60_000,
        value: { count: 1 }
      })
    ).rejects.toMatchObject({ code: "adapter_unavailable" });
  });

  it("documents the required Postgres schema", () => {
    expect(postgresSchema()).toContain("CREATE TABLE IF NOT EXISTS \"mcp_state\"");
    expect(postgresSchema()).toContain("value jsonb NOT NULL");
    expect(postgresSchema()).toContain("version integer NOT NULL");
    expect(postgresSchema()).toContain("CREATE TABLE IF NOT EXISTS \"mcp_state_events\"");
  });
});
