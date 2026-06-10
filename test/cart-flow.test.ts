import { CartService } from "../src/cart/cartService.js";
import { CartState } from "../src/cart/types.js";
import { InMemoryStateStore } from "../src/state/memoryStore.js";

const scope = { tenantId: "tenant-a", userId: "user-a" };

describe("CartService", () => {
  it("creates a cart, updates it by cart_id, and fetches it by cart_id", async () => {
    const store = new InMemoryStateStore<CartState>();
    const service = new CartService(store);

    const created = await service.createCart(scope);
    expect(created.cart_id).toMatch(/^cart_/);
    expect(created.items_count).toBe(0);

    const updated = await service.addCartItem(scope, {
      cart_id: created.cart_id,
      sku: "ceramic-mug",
      quantity: 2
    });

    expect(updated.items_count).toBe(2);
    expect(updated.subtotal_cents).toBe(3600);

    const fetched = await service.getCart(scope, created.cart_id);
    expect(fetched).toMatchObject({
      cart_id: created.cart_id,
      items_count: 2,
      subtotal_cents: 3600
    });
  });

  it("does not expose carts outside the matching tenant and user scope", async () => {
    const store = new InMemoryStateStore<CartState>();
    const service = new CartService(store);
    const created = await service.createCart(scope);

    await expect(
      service.getCart({ tenantId: "tenant-a", userId: "user-b" }, created.cart_id)
    ).rejects.toMatchObject({ code: "forbidden" });
  });

  it("returns an expired error for expired cart handles", async () => {
    let currentTime = new Date("2026-01-01T00:00:00Z");
    const store = new InMemoryStateStore<CartState>(() => currentTime);
    const service = new CartService(store);
    const created = await service.createCart(scope);

    currentTime = new Date("2026-01-01T02:00:00Z");

    await expect(service.getCart(scope, created.cart_id)).rejects.toMatchObject({
      code: "expired"
    });
  });
});
