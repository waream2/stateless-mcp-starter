import { describe, expect, it } from "vitest";
import { readConfig } from "../src/config.js";

describe("production auth/config guardrails", () => {
  it("allows dev auth outside production", () => {
    expect(readConfig({ NODE_ENV: "development" }).auth.mode).toBe("dev");
  });

  it("rejects dev auth in production", () => {
    expect(() => readConfig({ NODE_ENV: "production" })).toThrow(
      "AUTH_MODE=dev is not allowed"
    );
  });

  it("requires a bearer token in bearer mode", () => {
    expect(() => readConfig({ AUTH_MODE: "bearer" })).toThrow("AUTH_BEARER_TOKEN is required");
  });

  it("requires DynamoDB table name for the DynamoDB state adapter", () => {
    expect(() => readConfig({ STATE_ADAPTER: "dynamodb" })).toThrow(
      "DYNAMODB_TABLE_NAME is required"
    );
  });

  it("requires a Postgres connection string for the Postgres state adapter", () => {
    expect(() => readConfig({ STATE_ADAPTER: "postgres" })).toThrow(
      "POSTGRES_CONNECTION_STRING is required"
    );
  });
});
