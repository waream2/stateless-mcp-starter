# Stateless MCP Starter

An Express + TypeScript starter for building stateless MCP servers with explicit, typed application state.

This repo demonstrates a simple production-oriented pattern:

1. Keep MCP protocol handling stateless.
2. Store application state behind a `StateStore<TState>`.
3. Return opaque handles like `cart_...`, `booking_...`, or `draft_...` from tools.
4. Require later tool calls to pass those handles back as normal arguments.

The included shopping-cart tools are just an example domain. The important idea is not ecommerce; it is the explicit state-handle pattern. The same shape works for bookings, support tickets, onboarding flows, insurance quotes, approvals, drafts, and other multi-turn workflows.

## Why This Exists

Remote MCP servers should be easy to scale horizontally. A later request should not need to find the same process, protocol session, or in-memory object that handled the first request.

Instead, the model receives an application handle from one tool call:

```json
{
  "cart_id": "cart_abc123"
}
```

Then it passes that handle into the next tool call:

```json
{
  "cart_id": "cart_abc123",
  "sku": "ceramic-mug",
  "quantity": 2
}
```

Any server instance can handle either request because the state lives in the configured `StateStore`, not in MCP protocol/session state.

## Quickstart

Generate a new project:

```bash
pnpm dlx create-stateless-mcp my-server
cd my-server
pnpm install
pnpm dev
```

The server starts on `http://127.0.0.1:3000` by default.

```bash
curl http://127.0.0.1:3000/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "stateless-mcp-starter"
}
```

You can also run this checkout directly:

```bash
pnpm install
pnpm dev
```

## Generator

This package provides a `create-stateless-mcp` CLI:

```bash
pnpm dlx create-stateless-mcp my-server
```

For local development from this repo:

```bash
node bin/create-stateless-mcp.js my-server --yes
```

Options:

```bash
node bin/create-stateless-mcp.js my-server \
  --state-adapter memory \
  --auth-mode dev \
  --example-domain shopping-cart \
  --yes
```

Supported choices:

- `--state-adapter memory|dynamodb|postgres`
- `--auth-mode dev|bearer`
- `--example-domain shopping-cart|minimal`

Use `shopping-cart` when you want a concrete working example. Use `minimal` when you want the MCP server scaffold without example domain code.

## Included MCP Tools

The shopping-cart example exposes these tools over `/mcp`:

- `list_products`: returns available product SKUs.
- `create_cart`: creates a cart and returns `cart_id`.
- `add_cart_item`: adds an item using `cart_id`, `sku`, and `quantity`.
- `get_cart`: fetches the cart using `cart_id`.

The tool names and cart types are intentionally replaceable. They exist to make the handle flow obvious.

## State Model

`StateStore<TState>` is the application state boundary. Records include:

- handle
- type
- tenant/user scope
- status
- version
- timestamps
- TTL
- typed value

Handles are opaque identifiers, not authorization. Every state read or write also receives tenant/user scope.

Included adapters:

- `InMemoryStateStore` for local development and tests.
- `DynamoStateStore` for shared production-style state.
- `PostgresStateStore` for shared production-style state in Postgres.

Memory mode is zero setup:

```bash
STATE_ADAPTER=memory
```

DynamoDB mode:

```bash
STATE_ADAPTER=dynamodb
DYNAMODB_TABLE_NAME=stateless-mcp-state
AWS_REGION=us-east-1
```

Postgres mode:

```bash
STATE_ADAPTER=postgres
POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp
POSTGRES_TABLE_NAME=mcp_state
```

See [docs/adapters.md](docs/adapters.md) for adapter details and the Postgres schema.

## Auth And Context

Local development defaults to permissive dev auth:

```bash
AUTH_MODE=dev
```

Production should use the bearer-token stub or replace it with your own auth layer:

```bash
NODE_ENV=production
AUTH_MODE=bearer
AUTH_BEARER_TOKEN=replace-with-a-real-secret
```

Every MCP request gets a typed context with `requestId`, `tenantId`, `userId`, and scopes. In dev mode, `x-tenant-id`, `x-user-id`, and `x-user-scopes` headers are optional. In bearer mode, tenant/user headers are required and state operations remain scoped by both values.

## MCP SDK Compatibility

This starter uses the production-ready v1 `@modelcontextprotocol/sdk` package and Streamable HTTP transport. The HTTP transport is configured without server-side session IDs, so application continuity comes from explicit handles and the configured `StateStore`.

Protocol-specific wiring is isolated in `src/http/app.ts` and `src/mcp/createServer.ts`, so future SDK changes should not require rewriting your state model, tools, or auth boundary.

## Project Structure

```text
src/
  auth/              request auth and typed request context
  cart/              example shopping-cart domain
  http/              Express app, /health, and /mcp route
  mcp/               MCP server and tool registration
  state/             StateStore interface and adapters
test/                focused unit and flow tests
docs/                deployment, adapters, and explicit-handle notes
bin/                 create-stateless-mcp generator
```

## Scripts

```bash
pnpm dev
pnpm test
pnpm build
```

## What This Is

- A starter for stateless remote MCP servers.
- A concrete example of explicit multi-turn application state.
- A TypeScript/Express scaffold with tests, Docker support, and a generator.
- A place to swap in your own domain tools and state types.

## What This Is Not

- A complete auth solution.
- A hosted deployment platform.
- A framework that hides MCP concepts from you.
- An ecommerce product. The cart domain is only an example.

## Deployment

See [docs/deployment.md](docs/deployment.md) for Docker, required environment variables, and no-sticky-session guidance.

## Future Milestones

- Redis `StateStore` adapter.
- JWT auth hardening.
- More deployment examples.
- More generated templates.

## Release

This project is prepared for npm publishing as `create-stateless-mcp`, but no publish or release action should happen without explicit approval. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
