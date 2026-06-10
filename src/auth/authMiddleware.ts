import { randomUUID } from "node:crypto";
import { NextFunction, Request, RequestHandler, Response } from "express";
import { AppConfig } from "../config.js";
import { AppError } from "../errors.js";
import { RequestContext } from "../mcp/context.js";
import { createLogger } from "../observability/logger.js";

export function authMiddleware(config: AppConfig["auth"]): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const requestId = req.header("x-request-id") ?? randomUUID();
      const context = authenticateRequest(req, config, requestId);
      res.locals.requestContext = context;
      next();
    } catch (error) {
      const status = error instanceof AppError && error.code === "unauthorized" ? 401 : 500;
      res.status(status).json({
        jsonrpc: "2.0",
        error: {
          code: status === 401 ? -32001 : -32603,
          message: error instanceof Error ? error.message : "Authentication failed."
        },
        id: null
      });
    }
  };
}

export function requestContextFromLocals(res: Response): RequestContext {
  const context = res.locals.requestContext as RequestContext | undefined;
  if (!context) {
    throw new AppError("unauthorized", "Request context is missing.");
  }
  return context;
}

function authenticateRequest(
  req: Request,
  config: AppConfig["auth"],
  requestId: string
): RequestContext {
  if (config.mode === "bearer") {
    const expected = `Bearer ${config.bearerToken}`;
    if (!config.bearerToken || req.header("authorization") !== expected) {
      throw new AppError("unauthorized", "Missing or invalid bearer token.");
    }
  }

  const tenantId = req.header("x-tenant-id") ?? (config.mode === "dev" ? "dev-tenant" : undefined);
  const userId = req.header("x-user-id") ?? (config.mode === "dev" ? "dev-user" : undefined);

  if (!tenantId || !userId) {
    throw new AppError("unauthorized", "x-tenant-id and x-user-id are required.");
  }

  return {
    requestId,
    tenantId,
    userId,
    scopes: parseScopes(req.header("x-user-scopes")),
    logger: createLogger({ requestId, tenantId, userId })
  };
}

function parseScopes(header: string | undefined): string[] {
  if (!header) {
    return ["cart:read", "cart:write"];
  }
  return header
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
