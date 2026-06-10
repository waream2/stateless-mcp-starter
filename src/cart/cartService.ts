import { StateRecord, StateScope, StateStore, StateStoreError } from "../state/StateStore.js";
import { findProduct, products } from "./products.js";
import { CartState, CartSummary } from "./types.js";

const CART_TTL_MS = 1000 * 60 * 60;

export class CartService {
  constructor(private readonly store: StateStore<CartState>) {}

  listProducts() {
    return products;
  }

  async createCart(scope: StateScope, currency: "USD" = "USD"): Promise<CartSummary> {
    const record = await this.store.create({
      type: "cart",
      handlePrefix: "cart",
      scope,
      ttlMs: CART_TTL_MS,
      value: {
        currency,
        items: []
      }
    });

    return summarizeCart(record, true);
  }

  async addCartItem(
    scope: StateScope,
    input: { cart_id: string; sku: string; quantity: number }
  ): Promise<CartSummary> {
    const product = findProduct(input.sku);
    if (!product) {
      throw new CartToolError("invalid_input", `Unknown product SKU: ${input.sku}`);
    }

    const record = await this.requireCart(input.cart_id, scope);
    const existingItem = record.value.items.find((item) => item.sku === input.sku);
    const items = existingItem
      ? record.value.items.map((item) =>
          item.sku === input.sku ? { ...item, quantity: item.quantity + input.quantity } : item
        )
      : [
          ...record.value.items,
          {
            sku: product.sku,
            name: product.name,
            quantity: input.quantity,
            unitPriceCents: product.priceCents
          }
        ];

    const updated = await this.store.patch(
      input.cart_id,
      scope,
      { items },
      { expectedVersion: record.version }
    );

    await this.store.appendEvent(input.cart_id, scope, {
      type: "cart.item_added",
      at: new Date().toISOString(),
      data: { sku: input.sku, quantity: input.quantity }
    });

    return summarizeCart(updated, true);
  }

  async getCart(scope: StateScope, cartId: string): Promise<CartSummary> {
    const record = await this.requireCart(cartId, scope);
    return summarizeCart(record, true);
  }

  private async requireCart(handle: string, scope: StateScope): Promise<StateRecord<CartState>> {
    const record = await this.store.get(handle, scope);
    if (!record) {
      throw new StateStoreError("not_found", `No active cart found for cart_id ${handle}.`);
    }
    return record;
  }
}

export class CartToolError extends Error {
  constructor(
    public readonly code: "invalid_input",
    message: string
  ) {
    super(message);
    this.name = "CartToolError";
  }
}

export function summarizeCart(record: StateRecord<CartState>, includeItems = false): CartSummary {
  const itemsCount = record.value.items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotalCents = record.value.items.reduce(
    (sum, item) => sum + item.quantity * item.unitPriceCents,
    0
  );

  return {
    cart_id: record.handle,
    status: record.status,
    items_count: itemsCount,
    subtotal_cents: subtotalCents,
    currency: record.value.currency,
    version: record.version,
    expires_at: record.expiresAt,
    ...(includeItems ? { items: record.value.items } : {})
  };
}
