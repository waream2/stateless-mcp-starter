export type CartItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type CartState = {
  currency: "USD";
  items: CartItem[];
};

export type CartSummary = {
  cart_id: string;
  status: "active" | "completed" | "expired";
  items_count: number;
  subtotal_cents: number;
  currency: "USD";
  version: number;
  expires_at: string;
  items?: CartItem[];
};
