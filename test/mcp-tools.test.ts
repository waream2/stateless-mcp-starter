import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { CartService } from "../src/cart/cartService.js";
import { CartState } from "../src/cart/types.js";
import { createMcpServer } from "../src/mcp/createServer.js";
import { RequestContext } from "../src/mcp/context.js";
import { InMemoryStateStore } from "../src/state/memoryStore.js";
import { testLogger } from "./testLogger.js";

const openClients: Client[] = [];

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

describe("MCP cart tools", () => {
  it("creates a cart, adds an item by cart_id, and fetches the cart by cart_id", async () => {
    const client = await connectClient();
    const created = await client.request(
      {
        method: "tools/call",
        params: { name: "create_cart", arguments: { currency: "USD" } }
      },
      CallToolResultSchema
    );

    const createdPayload = created.structuredContent as { cart_id: string };
    expect(createdPayload.cart_id).toMatch(/^cart_/);

    const updated = await client.request(
      {
        method: "tools/call",
        params: {
          name: "add_cart_item",
          arguments: {
            cart_id: createdPayload.cart_id,
            sku: "ceramic-mug",
            quantity: 2
          }
        }
      },
      CallToolResultSchema
    );

    expect(updated.structuredContent).toMatchObject({
      cart_id: createdPayload.cart_id,
      items_count: 2,
      subtotal_cents: 3600
    });

    const fetched = await client.request(
      {
        method: "tools/call",
        params: { name: "get_cart", arguments: { cart_id: createdPayload.cart_id } }
      },
      CallToolResultSchema
    );

    expect(fetched.structuredContent).toMatchObject({
      cart_id: createdPayload.cart_id,
      items_count: 2,
      subtotal_cents: 3600
    });
  });

  it("returns structured missing-cart errors", async () => {
    const client = await connectClient();
    const result = await client.request(
      {
        method: "tools/call",
        params: { name: "get_cart", arguments: { cart_id: "cart_missing" } }
      },
      CallToolResultSchema
    );

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: {
        code: "not_found",
        message: "No active cart found for cart_id cart_missing."
      }
    });
  });
});

async function connectClient(): Promise<Client> {
  const context: RequestContext = {
    requestId: "test-request",
    tenantId: "tenant-a",
    userId: "user-a",
    scopes: ["cart:read", "cart:write"],
    logger: testLogger
  };
  const store = new InMemoryStateStore<CartState>();
  const server = createMcpServer(new CartService(store), context);
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openClients.push(client);
  return client;
}
