export type Product = {
  sku: string;
  name: string;
  priceCents: number;
};

export const products: Product[] = [
  { sku: "ceramic-mug", name: "Ceramic Mug", priceCents: 1800 },
  { sku: "canvas-tote", name: "Canvas Tote", priceCents: 2400 },
  { sku: "desk-plant", name: "Desk Plant", priceCents: 3200 }
];

export function findProduct(sku: string): Product | undefined {
  return products.find((product) => product.sku === sku);
}
