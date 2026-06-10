import { describe, expect, it } from "vitest";
import { CartService } from "../src/cart/cartService.js";
import { CartState } from "../src/cart/types.js";
import { DynamoStateStore } from "../src/state/dynamoStore.js";
import { FakeDynamoClient } from "./fakeDynamo.js";

const scope = { tenantId: "tenant-a", userId: "user-a" };

describe("stateless multi-instance routing", () => {
  it("creates on instance A, updates on instance B, and fetches on instance A through a shared store", async () => {
    const sharedDynamo = new FakeDynamoClient();
    const instanceAStore = new DynamoStateStore<CartState>({
      tableName: "mcp-state",
      client: sharedDynamo
    });
    const instanceBStore = new DynamoStateStore<CartState>({
      tableName: "mcp-state",
      client: sharedDynamo
    });
    const instanceA = new CartService(instanceAStore);
    const instanceB = new CartService(instanceBStore);

    const created = await instanceA.createCart(scope);
    const updated = await instanceB.addCartItem(scope, {
      cart_id: created.cart_id,
      sku: "ceramic-mug",
      quantity: 2
    });
    const fetched = await instanceA.getCart(scope, created.cart_id);

    expect(updated).toMatchObject({
      cart_id: created.cart_id,
      items_count: 2,
      subtotal_cents: 3600
    });
    expect(fetched).toMatchObject({
      cart_id: created.cart_id,
      items_count: 2,
      subtotal_cents: 3600
    });
  });
});
