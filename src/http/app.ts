import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Request, Response } from "express";
import { authMiddleware, requestContextFromLocals } from "../auth/authMiddleware.js";
import { CartService } from "../cart/cartService.js";
import { CartState } from "../cart/types.js";
import { AppConfig, readConfig } from "../config.js";
import { createMcpServer } from "../mcp/createServer.js";
import { errorFields } from "../observability/logger.js";
import { createCartStateStore } from "../state/createStateStore.js";
import { StateStore } from "../state/StateStore.js";
import { healthRouter } from "./health.js";

export type AppDependencies = {
  config?: AppConfig;
  cartStore?: StateStore<CartState>;
};

export function createApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? readConfig();
  const cartStore = dependencies.cartStore ?? createCartStateStore(config);
  const app = createMcpExpressApp();

  app.use(healthRouter());

  app.post("/mcp", authMiddleware(config.auth), async (req: Request, res: Response) => {
    const context = requestContextFromLocals(res);
    const cartService = new CartService(cartStore);
    const server = createMcpServer(cartService, context);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    const startedAt = Date.now();

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      context.logger.info(
        {
          route: "/mcp",
          durationMs: Date.now() - startedAt,
          stateAdapter: config.stateAdapter
        },
        "Handled MCP request"
      );
    } catch (error) {
      context.logger.error(
        {
          route: "/mcp",
          durationMs: Date.now() - startedAt,
          ...errorFields(error)
        },
        "Error handling MCP request"
      );
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  app.delete("/mcp", (_req, res) => {
    res.status(405).json({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    });
  });

  return app;
}
