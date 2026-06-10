# State Adapters

The starter keeps MCP protocol handling stateless. Multi-turn application state lives behind `StateStore<TState>` and is addressed by explicit handles such as `cart_...`.

## Local Memory

Use memory for local development and tests:

```bash
STATE_ADAPTER=memory
```

The memory adapter requires no setup, but it is not production-safe. State is process-local, disappears on restart, and is not shared across instances.

## DynamoDB

Use DynamoDB for production-style deployments:

```bash
STATE_ADAPTER=dynamodb
DYNAMODB_TABLE_NAME=stateless-mcp-state
AWS_REGION=us-east-1
```

Optional for local DynamoDB:

```bash
DYNAMODB_ENDPOINT=http://localhost:8000
```

Required table shape:

- Partition key: `handle` as a string.
- TTL attribute: `expiresAtEpoch` as a number.
- No sort key is required for the starter.

Stored attributes:

- `handle`
- `type`
- `tenantId`
- `userId`
- `status`
- `value`
- `version`
- `createdAt`
- `updatedAt`
- `expiresAt`
- `expiresAtEpoch`
- `events`

The adapter uses conditional writes for optimistic concurrency and tenant/user scoped access. Handles are not authorization; every state operation still checks `tenantId` and `userId`.

## Postgres

Use Postgres when you want a durable shared adapter that is easy to run locally and common in application stacks:

```bash
STATE_ADAPTER=postgres
POSTGRES_CONNECTION_STRING=postgres://postgres:postgres@127.0.0.1:5432/stateless_mcp
POSTGRES_TABLE_NAME=mcp_state
```

`POSTGRES_TABLE_NAME` defaults to `mcp_state`. The adapter also writes append-only events to a sibling table named `<table>_events`.

Required schema:

```sql
CREATE TABLE IF NOT EXISTS "mcp_state" (
  handle text PRIMARY KEY,
  type text NOT NULL,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed', 'expired')),
  value jsonb NOT NULL,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS "mcp_state_scope_idx"
  ON "mcp_state" (tenant_id, user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS "mcp_state_expiry_idx"
  ON "mcp_state" (expires_at);

CREATE TABLE IF NOT EXISTS "mcp_state_events" (
  id bigserial PRIMARY KEY,
  handle text NOT NULL REFERENCES "mcp_state"(handle) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL,
  at timestamptz NOT NULL,
  data jsonb
);
```

You can also import `postgresSchema()` from `src/state/postgresStore.ts` to get this schema string for migrations.

The adapter uses version-checked updates for optimistic concurrency and tenant/user scoped access. Handles are not authorization; every state operation still checks `tenantId` and `userId`.

## Redis

Redis is intentionally not implemented yet. The starter keeps the adapter boundary small so Redis or another durable store can be added later without changing tool code.
