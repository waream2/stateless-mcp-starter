import { Router } from "express";

export function healthPayload() {
  return {
    status: "ok",
    service: "stateless-mcp-starter"
  };
}

export function healthRouter(): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json(healthPayload());
  });

  return router;
}
