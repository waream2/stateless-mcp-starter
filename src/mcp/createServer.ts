import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { CartService } from "../cart/cartService.js";
import { AppError } from "../errors.js";
import { RequestContext } from "./context.js";
import { ok, toolError } from "./toolResponse.js";

export function createMcpServer(cartService: CartService, context: RequestContext): McpServer {
  const server = new McpServer({
    name: "stateless-mcp-starter",
    version: "0.1.0"
  });

  server.registerTool(
    "list_products",
    {
      title: "List Products",
      description: "List products that can be added to a shopping cart.",
      inputSchema: {},
      outputSchema: {
        products: z.array(
          z.object({
            sku: z.string(),
            name: z.string(),
            priceCents: z.number().int()
          })
        )
      }
    },
    withToolLogging(context, "list_products", async () => {
      try {
        requireScope(context, "cart:read");
        return ok({ products: cartService.listProducts() });
      } catch (error) {
        return toolError(error);
      }
    })
  );

  server.registerTool(
    "create_cart",
    {
      title: "Create Cart",
      description:
        "Create a cart and return an explicit cart_id handle. Use the cart_id in later cart tool calls.",
      inputSchema: {
        currency: z.literal("USD").default("USD")
      }
    },
    withToolLogging(context, "create_cart", async ({ currency }) => {
      try {
        requireScope(context, "cart:write");
        return ok(await cartService.createCart(context, currency));
      } catch (error) {
        return toolError(error);
      }
    })
  );

  server.registerTool(
    "add_cart_item",
    {
      title: "Add Cart Item",
      description: "Add a product to an existing cart by passing the explicit cart_id handle.",
      inputSchema: {
        cart_id: z.string().min(1).describe("Cart handle returned by create_cart."),
        sku: z.string().min(1).describe("Product SKU from list_products."),
        quantity: z.number().int().positive().max(99)
      }
    },
    withToolLogging(context, "add_cart_item", async ({ cart_id, sku, quantity }) => {
      try {
        requireScope(context, "cart:write");
        return ok(await cartService.addCartItem(context, { cart_id, sku, quantity }));
      } catch (error) {
        return toolError(error);
      }
    })
  );

  server.registerTool(
    "get_cart",
    {
      title: "Get Cart",
      description: "Fetch a cart by cart_id. Handles are scoped by tenant and user.",
      inputSchema: {
        cart_id: z.string().min(1).describe("Cart handle returned by create_cart.")
      }
    },
    withToolLogging(context, "get_cart", async ({ cart_id }) => {
      try {
        requireScope(context, "cart:read");
        return ok(await cartService.getCart(context, cart_id));
      } catch (error) {
        return toolError(error);
      }
    })
  );

  return server;
}

function requireScope(context: RequestContext, scope: string): void {
  if (!context.scopes.includes(scope)) {
    throw new AppError("forbidden", `Missing required scope: ${scope}`);
  }
}

function withToolLogging<TArgs>(
  context: RequestContext,
  toolName: string,
  handler: (args: TArgs) => Promise<ReturnType<typeof ok> | ReturnType<typeof toolError>>
) {
  return async (args: TArgs) => {
    const startedAt = Date.now();
    const result = await handler(args);
    const durationMs = Date.now() - startedAt;

    if ("isError" in result && result.isError) {
      context.logger.warn(
        {
          toolName,
          durationMs,
          errorCode: (result.structuredContent.error as { code?: string } | undefined)?.code
        },
        "MCP tool returned an error"
      );
    } else {
      context.logger.info({ toolName, durationMs }, "MCP tool completed");
    }

    return result;
  };
}
