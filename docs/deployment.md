# Deployment

This starter is designed to run behind ordinary HTTP infrastructure without sticky sessions.

## Required Runtime

- Node.js 20 or newer.
- A deployed Express server exposing `/health` and `/mcp`.
- `AUTH_MODE=bearer` in production.
- A production state adapter, currently DynamoDB or Postgres.

## Environment

Local development:

```bash
AUTH_MODE=dev
STATE_ADAPTER=memory
```

Production:

```bash
NODE_ENV=production
AUTH_MODE=bearer
AUTH_BEARER_TOKEN=replace-with-a-real-secret
STATE_ADAPTER=dynamodb
DYNAMODB_TABLE_NAME=stateless-mcp-state
AWS_REGION=us-east-1
PORT=3000
HOST=0.0.0.0
```

Postgres production state uses the same auth/server settings with these adapter variables instead:

```bash
STATE_ADAPTER=postgres
POSTGRES_CONNECTION_STRING=postgres://user:password@host:5432/database
POSTGRES_TABLE_NAME=mcp_state
```

`AUTH_MODE=dev` intentionally fails when `NODE_ENV=production`.

## No Sticky Sessions

Do not enable sticky sessions for correctness. Each MCP request can be handled by any server instance because application state flows through explicit handles:

1. Instance A handles `create_cart` and returns `cart_id`.
2. Instance B handles `add_cart_item` with that `cart_id`.
3. Instance A handles `get_cart` with that same `cart_id`.

The shared `StateStore` adapter provides continuity. MCP protocol/session state is not used to store cart contents.

The cart names are examples only. The deployment rule is the same for any domain: every later request must include an explicit application handle, and every instance must read/write state through the configured `StateStore`.

## Docker

Build:

```bash
docker build -t stateless-mcp-starter .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e AUTH_MODE=bearer \
  -e AUTH_BEARER_TOKEN=replace-with-a-real-secret \
  -e STATE_ADAPTER=dynamodb \
  -e DYNAMODB_TABLE_NAME=stateless-mcp-state \
  -e AWS_REGION=us-east-1 \
  stateless-mcp-starter
```

For Postgres-backed containers, replace the DynamoDB variables with:

```bash
-e STATE_ADAPTER=postgres \
-e POSTGRES_CONNECTION_STRING=postgres://user:password@host:5432/database \
-e POSTGRES_TABLE_NAME=mcp_state
```

For local-only container experiments, you can run memory mode by omitting `NODE_ENV=production` and setting `AUTH_MODE=dev`, but do not deploy that configuration.
