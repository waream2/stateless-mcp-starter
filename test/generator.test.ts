import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("create-stateless-mcp generator", () => {
  it("generates a buildable and testable shopping-cart project", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "create-stateless-mcp-"));
    const target = join(tempRoot, "generated-cart");

    execFileSync(
      "node",
      [
        join(repoRoot, "bin/create-stateless-mcp.js"),
        "generated-cart",
        "--target",
        target,
        "--state-adapter",
        "memory",
        "--auth-mode",
        "dev",
        "--example-domain",
        "shopping-cart",
        "--yes"
      ],
      { cwd: repoRoot, stdio: "pipe" }
    );

    for (const file of [
      "package.json",
      "README.md",
      ".env.example",
      "src/http/health.ts",
      "src/http/app.ts",
      "src/mcp/createServer.ts",
      "src/state/StateStore.ts",
      "src/state/memoryStore.ts",
      "src/state/dynamoStore.ts",
      "src/state/postgresStore.ts",
      "test/mcp-tools.test.ts",
      "test/stateless-routing.test.ts"
    ]) {
      expect(existsSync(join(target, file)), file).toBe(true);
    }

    const generatedPackage = JSON.parse(readFileSync(join(target, "package.json"), "utf8"));
    expect(generatedPackage).toMatchObject({
      name: "generated-cart",
      private: true,
      type: "module"
    });
    expect(generatedPackage.bin).toBeUndefined();

    const sourceText = readFileSync(join(target, "src/mcp/createServer.ts"), "utf8");
    expect(sourceText).toContain("create_cart");
    expect(sourceText).toContain("add_cart_item");
    expect(sourceText).toContain("get_cart");

    const storePath = execFileSync("pnpm", ["store", "path"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();

    execFileSync("pnpm", ["install", "--offline", "--store-dir", storePath], {
      cwd: target,
      stdio: "pipe",
      env: { ...process.env, CI: "true" }
    });
    execFileSync("pnpm", ["build"], { cwd: target, stdio: "pipe" });
    execFileSync("pnpm", ["test"], { cwd: target, stdio: "pipe" });
  }, 120_000);

  it("generates a minimal project without shopping-cart domain files or docs", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "create-stateless-mcp-minimal-"));
    const target = join(tempRoot, "generated-minimal");

    execFileSync(
      "node",
      [
        join(repoRoot, "bin/create-stateless-mcp.js"),
        "generated-minimal",
        "--target",
        target,
        "--state-adapter",
        "memory",
        "--auth-mode",
        "dev",
        "--example-domain",
        "minimal",
        "--yes"
      ],
      { cwd: repoRoot, stdio: "pipe" }
    );

    for (const file of [
      "package.json",
      "README.md",
      ".env.example",
      "src/http/health.ts",
      "src/http/app.ts",
      "src/mcp/createServer.ts",
      "src/state/StateStore.ts",
      "src/state/memoryStore.ts",
      "src/state/dynamoStore.ts",
      "src/state/postgresStore.ts",
      "test/mcp-tools.test.ts"
    ]) {
      expect(existsSync(join(target, file)), file).toBe(true);
    }

    for (const file of [
      "src/cart",
      "test/cart-flow.test.ts",
      "test/stateless-routing.test.ts"
    ]) {
      expect(existsSync(join(target, file)), file).toBe(false);
    }

    const mcpSource = readFileSync(join(target, "src/mcp/createServer.ts"), "utf8");
    expect(mcpSource).toContain("server_info");
    expect(mcpSource).not.toContain("create_cart");
    expect(mcpSource).not.toContain("add_cart_item");
    expect(mcpSource).not.toContain("get_cart");

    const generatedText = [
      "README.md",
      "docs/explicit-handles.md",
      "docs/migration-from-sessions.md",
      "docs/deployment.md",
      "docs/adapters.md",
      "src/http/app.ts",
      "src/mcp/createServer.ts",
      "src/auth/authMiddleware.ts",
      "test/mcp-tools.test.ts"
    ]
      .map((file) => readFileSync(join(target, file), "utf8"))
      .join("\n");

    expect(generatedText).not.toMatch(/shopping|cart_id|create_cart|add_cart_item|get_cart|sku/i);
    expect(generatedText).toContain("server_info");
    expect(generatedText).toContain("booking_id");

    const storePath = execFileSync("pnpm", ["store", "path"], {
      cwd: repoRoot,
      encoding: "utf8"
    }).trim();

    execFileSync("pnpm", ["install", "--offline", "--store-dir", storePath], {
      cwd: target,
      stdio: "pipe",
      env: { ...process.env, CI: "true" }
    });
    execFileSync("pnpm", ["build"], { cwd: target, stdio: "pipe" });
    execFileSync("pnpm", ["test"], { cwd: target, stdio: "pipe" });
  }, 120_000);

  it("can generate Postgres adapter configuration", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "create-stateless-mcp-postgres-"));
    const target = join(tempRoot, "generated-postgres");

    execFileSync(
      "node",
      [
        join(repoRoot, "bin/create-stateless-mcp.js"),
        "generated-postgres",
        "--target",
        target,
        "--state-adapter",
        "postgres",
        "--auth-mode",
        "bearer",
        "--example-domain",
        "minimal",
        "--yes"
      ],
      { cwd: repoRoot, stdio: "pipe" }
    );

    const envExample = readFileSync(join(target, ".env.example"), "utf8");
    expect(envExample).toContain("STATE_ADAPTER=postgres");
    expect(envExample).toContain("POSTGRES_CONNECTION_STRING=");
    expect(envExample).toContain("POSTGRES_TABLE_NAME=mcp_state");

    const readme = readFileSync(join(target, "README.md"), "utf8");
    expect(readme).toContain("configured for Postgres");

    const factorySource = readFileSync(join(target, "src/state/createStateStore.ts"), "utf8");
    expect(factorySource).toContain("PostgresStateStore");
  });
});
