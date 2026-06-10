import { describe, expect, it } from "vitest";
import { healthPayload } from "../src/http/health.js";

describe("health endpoint payload", () => {
  it("returns a healthy response body for GET /health", () => {
    expect(healthPayload()).toEqual({
      status: "ok",
      service: "stateless-mcp-starter"
    });
  });
});
