import { describe, expect, it } from "vitest";
import { DynamoStateStore } from "../src/state/dynamoStore.js";
import { FakeDynamoClient } from "./fakeDynamo.js";
import { describeStateStoreContract } from "./state-store-contract.js";

describeStateStoreContract(
  "DynamoStateStore",
  (clock) =>
    new DynamoStateStore({
      tableName: "mcp-state",
      client: new FakeDynamoClient(),
      now: () => clock.now
    })
);

describe("DynamoStateStore adapter errors", () => {
  it("normalizes DynamoDB client failures", async () => {
    const client = new FakeDynamoClient();
    client.failRequests = true;
    const store = new DynamoStateStore<{ count: number }>({
      tableName: "mcp-state",
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
});
