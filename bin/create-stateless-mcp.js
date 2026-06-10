#!/usr/bin/env node
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const answers = await collectAnswers(args);
  const targetDir = resolve(args.target ?? join(process.cwd(), answers.projectName));

  await ensureEmptyOrCreate(targetDir, args.force);
  await copyStarter(targetDir, answers);
  await writeExampleDomainFiles(targetDir, answers);
  await writeGeneratedPackageJson(targetDir, answers.projectName);
  await writeGeneratedEnvExample(targetDir, answers);
  await writeGeneratedReadme(targetDir, answers);

  console.log(`Created ${answers.projectName} in ${targetDir}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  cd ${targetDir}`);
  console.log("  pnpm install");
  console.log("  pnpm dev");
}

function parseArgs(argv) {
  const parsed = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--yes" || value === "-y") {
      parsed.yes = true;
    } else if (value === "--force") {
      parsed.force = true;
    } else if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) {
        throw new Error(`Missing value for ${value}`);
      }
      parsed[toCamelCase(key)] = next;
      index += 1;
    } else if (!parsed.projectName) {
      parsed.projectName = value;
    } else {
      throw new Error(`Unexpected argument: ${value}`);
    }
  }

  return parsed;
}

async function collectAnswers(args) {
  const defaults = {
    projectName: slugify(args.projectName ?? "my-stateless-mcp"),
    stateAdapter: validateChoice(args.stateAdapter, ["memory", "dynamodb", "postgres"], "memory"),
    authMode: validateChoice(args.authMode, ["dev", "bearer"], "dev"),
    exampleDomain: validateChoice(args.exampleDomain, ["shopping-cart", "minimal"], "shopping-cart")
  };

  if (args.yes) {
    return defaults;
  }

  const terminal = createInterface({ input, output });
  try {
    return {
      projectName: slugify(
        await ask(terminal, `Project name (${defaults.projectName}): `, defaults.projectName)
      ),
      stateAdapter: validateChoice(
        await ask(
          terminal,
          "State adapter: memory, dynamodb, or postgres (memory): ",
          defaults.stateAdapter
        ),
        ["memory", "dynamodb", "postgres"],
        defaults.stateAdapter
      ),
      authMode: validateChoice(
        await ask(terminal, "Auth mode: dev or bearer (dev): ", defaults.authMode),
        ["dev", "bearer"],
        defaults.authMode
      ),
      exampleDomain: validateChoice(
        await ask(
          terminal,
          "Example domain: shopping-cart or minimal (shopping-cart): ",
          defaults.exampleDomain
        ),
        ["shopping-cart", "minimal"],
        defaults.exampleDomain
      )
    };
  } finally {
    terminal.close();
  }
}

async function ask(terminal, question, fallback) {
  const answer = (await terminal.question(question)).trim();
  return answer || fallback;
}

async function ensureEmptyOrCreate(targetDir, force = false) {
  await mkdir(dirname(targetDir), { recursive: true });

  try {
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      if (!force) {
        throw new Error(`Target directory is not empty: ${targetDir}`);
      }
      await rm(targetDir, { recursive: true, force: true });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      throw error;
    }
  }

  await mkdir(targetDir, { recursive: true });
}

async function copyStarter(targetDir, answers) {
  const entries = [
    "src",
    "test",
    "docs",
    "Dockerfile",
    ".dockerignore",
    ".env.example",
    "tsconfig.json",
    "vitest.config.ts",
    "README.md",
    "LICENSE"
  ];

  for (const entry of entries) {
    await cp(join(rootDir, entry), join(targetDir, entry), {
      recursive: true,
      filter: (source) => shouldCopy(source, answers)
    });
  }

  await copyLockfile(targetDir);
}

async function copyLockfile(targetDir) {
  const rootLockfile = join(rootDir, "pnpm-lock.yaml");
  const packagedLockfile = join(rootDir, "template/pnpm-lock.yaml");
  const source = (await exists(rootLockfile)) ? rootLockfile : packagedLockfile;
  await cp(source, join(targetDir, "pnpm-lock.yaml"));
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function shouldCopy(source, answers) {
  const relative = source.slice(rootDir.length + 1);
  if (
    relative.includes("generator.test.ts") ||
    relative.startsWith("bin") ||
    relative.startsWith(".github")
  ) {
    return false;
  }

  if (answers.exampleDomain === "minimal") {
    return (
      !relative.startsWith("src/cart") &&
      !relative.startsWith("test/cart-flow.test.ts") &&
      !relative.startsWith("test/mcp-tools.test.ts") &&
      !relative.startsWith("test/stateless-routing.test.ts")
    );
  }

  return true;
}

async function writeExampleDomainFiles(targetDir, answers) {
  if (answers.exampleDomain !== "minimal") {
    return;
  }

  await writeFile(join(targetDir, "src/http/app.ts"), minimalAppSource);
  await writeFile(join(targetDir, "src/mcp/createServer.ts"), minimalMcpServerSource);
  await writeFile(join(targetDir, "src/mcp/toolResponse.ts"), minimalToolResponseSource);
  await writeFile(join(targetDir, "src/state/createStateStore.ts"), minimalCreateStateStoreSource);
  await writeFile(join(targetDir, "src/auth/authMiddleware.ts"), minimalAuthMiddlewareSource);
  await writeFile(join(targetDir, "test/mcp-tools.test.ts"), minimalMcpToolsTestSource);
  await writeFile(join(targetDir, "docs/explicit-handles.md"), minimalExplicitHandlesDoc);
  await writeFile(join(targetDir, "docs/migration-from-sessions.md"), minimalMigrationDoc);
  await writeFile(join(targetDir, "docs/deployment.md"), minimalDeploymentDoc);
  await writeFile(join(targetDir, "docs/adapters.md"), minimalAdaptersDoc);
}

async function writeGeneratedPackageJson(targetDir, projectName) {
  const source = JSON.parse(await readFile(join(rootDir, "package.json"), "utf8"));
  const generated = {
    name: projectName,
    version: "0.1.0",
    private: true,
    type: source.type,
    packageManager: source.packageManager,
    description: "Stateless MCP server generated by create-stateless-mcp.",
    scripts: source.scripts,
    engines: source.engines,
    dependencies: source.dependencies,
    devDependencies: source.devDependencies
  };

  await writeFile(join(targetDir, "package.json"), `${JSON.stringify(generated, null, 2)}\n`);
}

async function writeGeneratedEnvExample(targetDir, answers) {
  const env = [
    "PORT=3000",
    "HOST=127.0.0.1",
    "",
    answers.authMode === "bearer"
      ? "AUTH_MODE=bearer\nAUTH_BEARER_TOKEN=replace-with-a-real-secret"
      : "AUTH_MODE=dev\n# AUTH_BEARER_TOKEN=replace-with-a-real-secret",
    "",
    stateAdapterEnv(answers.stateAdapter)
  ].join("\n");

  await writeFile(join(targetDir, ".env.example"), `${env}\n`);
}

function stateAdapterEnv(stateAdapter) {
  if (stateAdapter === "dynamodb") {
    return [
      "STATE_ADAPTER=dynamodb",
      "DYNAMODB_TABLE_NAME=stateless-mcp-state",
      "AWS_REGION=us-east-1",
      "# DYNAMODB_ENDPOINT=http://localhost:8000",
      "# STATE_ADAPTER=postgres",
      "# POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp",
      "# POSTGRES_TABLE_NAME=mcp_state"
    ].join("\n");
  }

  if (stateAdapter === "postgres") {
    return [
      "STATE_ADAPTER=postgres",
      "POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp",
      "POSTGRES_TABLE_NAME=mcp_state",
      "# STATE_ADAPTER=dynamodb",
      "# DYNAMODB_TABLE_NAME=stateless-mcp-state",
      "# AWS_REGION=us-east-1",
      "# DYNAMODB_ENDPOINT=http://localhost:8000"
    ].join("\n");
  }

  return [
    "STATE_ADAPTER=memory",
    "# STATE_ADAPTER=dynamodb",
    "# DYNAMODB_TABLE_NAME=stateless-mcp-state",
    "# AWS_REGION=us-east-1",
    "# DYNAMODB_ENDPOINT=http://localhost:8000",
    "# STATE_ADAPTER=postgres",
    "# POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp",
    "# POSTGRES_TABLE_NAME=mcp_state"
  ].join("\n");
}

async function writeGeneratedReadme(targetDir, answers) {
  const title = toTitle(answers.projectName);
  const adapterLine =
    answers.stateAdapter === "dynamodb"
      ? "This project is configured for DynamoDB in `.env.example`; use `STATE_ADAPTER=memory` for local-only experiments."
      : answers.stateAdapter === "postgres"
        ? "This project is configured for Postgres in `.env.example`; use `STATE_ADAPTER=memory` for local-only experiments."
        : "This project defaults to in-memory state for local development; use DynamoDB or Postgres for production deployments.";
  const domainLine =
    answers.exampleDomain === "minimal"
      ? "This is the minimal scaffold: HTTP transport, auth/context/logging, state adapters, and one neutral `server_info` tool. Add your own domain tools in `src/mcp/createServer.ts`."
      : "The starter includes shopping-cart tools that demonstrate explicit `cart_id` handles.";
  const handleLabel = answers.exampleDomain === "minimal" ? "`example_...`" : "`cart_...`";
  const handleExample =
    answers.exampleDomain === "minimal"
      ? "For multi-turn workflows, create typed state through `StateStore<TState>`, return your own explicit handle such as `booking_id`, `ticket_id`, `quote_id`, or `draft_id`, and require that handle in later tool calls."
      : "Shopping-cart flow:\n\n1. `create_cart` returns `cart_id`.\n2. `add_cart_item` receives `cart_id`, `sku`, and `quantity`.\n3. `get_cart` fetches the cart by `cart_id`.";

  await writeFile(
    join(targetDir, "README.md"),
    `# ${title}

An Express + TypeScript stateless MCP server generated by \`create-stateless-mcp\`.

${domainLine}

The starter is not tied to any one business domain. The reusable pattern is explicit application state passed through typed handles.

## Quickstart

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

\`\`\`bash
curl http://127.0.0.1:3000/health
\`\`\`

## Explicit State Handles

MCP protocol handling stays stateless. Application state lives behind \`StateStore<TState>\`, and tools pass opaque handles such as ${handleLabel} between calls.

${handleExample}

## State Adapter

${adapterLine}

See \`docs/adapters.md\` and \`docs/deployment.md\`.

## Scripts

\`\`\`bash
pnpm test
pnpm build
pnpm dev
\`\`\`
`
  );
}

const minimalAppSource = `import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { Request, Response } from "express";
import { authMiddleware, requestContextFromLocals } from "../auth/authMiddleware.js";
import { AppConfig, readConfig } from "../config.js";
import { createMcpServer } from "../mcp/createServer.js";
import { errorFields } from "../observability/logger.js";
import { healthRouter } from "./health.js";

export type AppDependencies = {
  config?: AppConfig;
};

export function createApp(dependencies: AppDependencies = {}) {
  const config = dependencies.config ?? readConfig();
  const app = createMcpExpressApp();

  app.use(healthRouter());

  app.post("/mcp", authMiddleware(config.auth), async (req: Request, res: Response) => {
    const context = requestContextFromLocals(res);
    const server = createMcpServer(context);
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
`;

const minimalMcpServerSource = `import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import * as z from "zod/v4";
import { AppError } from "../errors.js";
import { RequestContext } from "./context.js";
import { ok, toolError } from "./toolResponse.js";

export function createMcpServer(context: RequestContext): McpServer {
  const server = new McpServer({
    name: "stateless-mcp-starter",
    version: "0.1.0"
  });

  server.registerTool(
    "server_info",
    {
      title: "Server Info",
      description: "Return basic information about this stateless MCP server scaffold.",
      inputSchema: {},
      outputSchema: {
        service: z.string(),
        version: z.string(),
        transport: z.literal("streamable-http"),
        statePattern: z.string()
      }
    },
    withToolLogging(context, "server_info", async () => {
      try {
        requireScope(context, "server:read");
        return ok({
          service: "stateless-mcp-starter",
          version: "0.1.0",
          transport: "streamable-http",
          statePattern:
            "Use StateStore<TState> to create typed application state, return an explicit handle, and require that handle in later tool calls."
        });
      } catch (error) {
        return toolError(error);
      }
    })
  );

  /*
   * Add your domain tools here.
   *
   * For multi-turn workflows:
   * 1. Create typed application state through StateStore<TState>.
   * 2. Return an explicit handle such as booking_id, ticket_id, quote_id, or draft_id.
   * 3. Require that handle in later tool calls.
   */

  return server;
}

function requireScope(context: RequestContext, scope: string): void {
  if (!context.scopes.includes(scope)) {
    throw new AppError("forbidden", \`Missing required scope: \${scope}\`);
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
`;

const minimalCreateStateStoreSource = `import { AppConfig } from "../config.js";
import { DynamoStateStore } from "./dynamoStore.js";
import { InMemoryStateStore } from "./memoryStore.js";
import { PostgresStateStore } from "./postgresStore.js";
import { StateStore } from "./StateStore.js";

export function createStateStore<TState>(config: AppConfig): StateStore<TState> {
  if (config.stateAdapter === "memory") {
    return new InMemoryStateStore<TState>();
  }

  if (config.stateAdapter === "dynamodb") {
    return DynamoStateStore.fromEnv<TState>({
      tableName: config.dynamodb.tableName!,
      region: config.dynamodb.region,
      endpoint: config.dynamodb.endpoint
    });
  }

  return PostgresStateStore.fromEnv<TState>({
    connectionString: config.postgres.connectionString!,
    tableName: config.postgres.tableName
  });
}
`;

const minimalToolResponseSource = `import { AppError, AppErrorCode } from "../errors.js";
import { StateStoreError } from "../state/StateStore.js";

export type ToolPayload = Record<string, unknown>;

export function ok(payload: ToolPayload) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

export function toolError(error: unknown) {
  const payload = normalizeError(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true
  };
}

function normalizeError(error: unknown) {
  if (error instanceof AppError) {
    return errorPayload(error.code, error.message);
  }

  if (error instanceof StateStoreError) {
    return errorPayload(error.code, error.message);
  }

  return errorPayload(
    "tool_execution_failed",
    error instanceof Error ? error.message : "Unknown tool error."
  );
}

function errorPayload(code: AppErrorCode, message: string) {
  return {
    error: {
      code,
      message
    }
  };
}
`;

const minimalAuthMiddlewareSource = `import { randomUUID } from "node:crypto";
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
    const expected = \`Bearer \${config.bearerToken}\`;
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
    return ["server:read"];
  }
  return header
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
`;

const minimalMcpToolsTestSource = `import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer } from "../src/mcp/createServer.js";
import { RequestContext } from "../src/mcp/context.js";
import { testLogger } from "./testLogger.js";

const openClients: Client[] = [];

afterEach(async () => {
  await Promise.all(openClients.splice(0).map((client) => client.close()));
});

describe("minimal MCP tools", () => {
  it("returns server info", async () => {
    const client = await connectClient();
    const result = await client.request(
      {
        method: "tools/call",
        params: { name: "server_info", arguments: {} }
      },
      CallToolResultSchema
    );

    expect(result.structuredContent).toMatchObject({
      service: "stateless-mcp-starter",
      version: "0.1.0",
      transport: "streamable-http"
    });
  });
});

async function connectClient(): Promise<Client> {
  const context: RequestContext = {
    requestId: "test-request",
    tenantId: "tenant-a",
    userId: "user-a",
    scopes: ["server:read"],
    logger: testLogger
  };
  const server = createMcpServer(context);
  const client = new Client({ name: "test-client", version: "0.1.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  openClients.push(client);
  return client;
}
`;

const minimalExplicitHandlesDoc = `# Explicit Handles

Stateless MCP does not mean your application has no state. It means MCP protocol handling should not hide workflow state in transport sessions.

Use explicit application handles:

1. A tool creates typed application state.
2. The server stores that state through \`StateStore<TState>\`.
3. The tool returns an opaque handle such as \`booking_id\`, \`ticket_id\`, \`quote_id\`, or \`draft_id\`.
4. Later tool calls pass the handle back as a normal argument.

## Rules

- Handles are identifiers, not authorization.
- Every state read/write also receives \`tenantId\` and \`userId\`.
- Handles should be opaque and prefixed only for debugging.
- State records should include TTL and version fields.
- Tool descriptions should tell the model which handle to preserve for later calls.

## Why This Scales

Any server instance can handle any MCP request because the request contains the handle and the shared state adapter contains the state. There is no need for load-balancer affinity or hidden MCP session state.
`;

const minimalMigrationDoc = `# Migration From Sessions

Use this guide when moving an MCP server away from sticky sessions or hidden protocol/session state.

## Before

A session-oriented flow often looks like this:

1. Request lands on instance A.
2. Instance A stores workflow state in memory or protocol session state.
3. Later requests must return to instance A, or every instance must synchronize session state.

This creates operational pressure for sticky sessions and custom state replication.

## After

An explicit-handle flow looks like this:

1. A start tool writes a typed state record through \`StateStore\`.
2. The start tool returns a domain handle such as \`booking_id\`, \`ticket_id\`, \`quote_id\`, or \`draft_id\`.
3. Later tools receive that handle and load state through \`StateStore\`.
4. Any instance can serve any step.

## Migration Checklist

- Identify state currently stored in MCP session/protocol objects.
- Move that state into a typed application state record.
- Add an opaque handle field for your domain.
- Require later tools to accept that handle explicitly.
- Scope state operations by authenticated \`tenantId\` and \`userId\`.
- Add TTL and version fields to state records.
- Add tests that simulate multiple instances sharing one state adapter.
- Disable sticky-session assumptions in deployment docs and load balancer config.
`;

const minimalDeploymentDoc = `# Deployment

This starter is designed to run behind ordinary HTTP infrastructure without sticky sessions.

## Required Runtime

- Node.js 20 or newer.
- A deployed Express server exposing \`/health\` and \`/mcp\`.
- \`AUTH_MODE=bearer\` in production.
- A production state adapter, currently DynamoDB or Postgres.

## Environment

Local development:

\`\`\`bash
AUTH_MODE=dev
STATE_ADAPTER=memory
\`\`\`

Production:

\`\`\`bash
NODE_ENV=production
AUTH_MODE=bearer
AUTH_BEARER_TOKEN=replace-with-a-real-secret
STATE_ADAPTER=dynamodb
DYNAMODB_TABLE_NAME=stateless-mcp-state
AWS_REGION=us-east-1
PORT=3000
HOST=0.0.0.0
\`\`\`

Postgres production state uses the same auth/server settings with these adapter variables instead:

\`\`\`bash
STATE_ADAPTER=postgres
POSTGRES_CONNECTION_STRING=postgres://user:password@host:5432/database
POSTGRES_TABLE_NAME=mcp_state
\`\`\`

\`AUTH_MODE=dev\` intentionally fails when \`NODE_ENV=production\`.

## No Sticky Sessions

Do not enable sticky sessions for correctness. Each MCP request can be handled by any server instance because application state flows through explicit handles.

The deployment rule is domain-neutral: every later request must include an explicit application handle, and every instance must read/write state through the configured \`StateStore\`.

## Docker

\`\`\`bash
docker build -t stateless-mcp-server .
\`\`\`
`;

const minimalAdaptersDoc = `# State Adapters

The starter keeps MCP protocol handling stateless. Multi-turn application state lives behind \`StateStore<TState>\` and is addressed by explicit handles such as \`booking_id\`, \`ticket_id\`, \`quote_id\`, or \`draft_id\`.

## Local Memory

Use memory for local development and tests:

\`\`\`bash
STATE_ADAPTER=memory
\`\`\`

The memory adapter requires no setup, but it is not production-safe. State is process-local, disappears on restart, and is not shared across instances.

## DynamoDB

Use DynamoDB for production-style deployments:

\`\`\`bash
STATE_ADAPTER=dynamodb
DYNAMODB_TABLE_NAME=stateless-mcp-state
AWS_REGION=us-east-1
\`\`\`

Optional for local DynamoDB:

\`\`\`bash
DYNAMODB_ENDPOINT=http://localhost:8000
\`\`\`

Required table shape:

- Partition key: \`handle\` as a string.
- TTL attribute: \`expiresAtEpoch\` as a number.
- No sort key is required for the starter.

The adapter uses conditional writes for optimistic concurrency and tenant/user scoped access. Handles are not authorization; every state operation still checks \`tenantId\` and \`userId\`.

## Postgres

Use Postgres when you want a durable shared adapter that is easy to run locally and common in application stacks:

\`\`\`bash
STATE_ADAPTER=postgres
POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp
POSTGRES_TABLE_NAME=mcp_state
\`\`\`

\`POSTGRES_TABLE_NAME\` defaults to \`mcp_state\`. The adapter also writes append-only events to a sibling table named \`<table>_events\`.

You can import \`postgresSchema()\` from \`src/state/postgresStore.ts\` to get the required schema string for migrations.

The adapter uses version-checked updates for optimistic concurrency and tenant/user scoped access. Handles are not authorization; every state operation still checks \`tenantId\` and \`userId\`.
`;

function validateChoice(value, choices, fallback) {
  const normalized = (value ?? fallback).toLowerCase();
  if (!choices.includes(normalized)) {
    throw new Error(`Expected one of ${choices.join(", ")}, got ${value}`);
  }
  return normalized;
}

function slugify(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    throw new Error("Project name cannot be empty.");
  }
  return slug;
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function toTitle(value) {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

await main();
