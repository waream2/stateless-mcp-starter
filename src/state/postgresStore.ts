import pg from "pg";
import { createHandle } from "./handles.js";
import {
  CreateStateInput,
  StateEvent,
  StateRecord,
  StateScope,
  StateStore,
  StateStoreError
} from "./StateStore.js";

export type PostgresQueryResult<T = unknown> = {
  rows: T[];
  rowCount?: number | null;
};

export type PostgresClientLike = {
  query<T = unknown>(text: string, values?: unknown[]): Promise<PostgresQueryResult<T>>;
};

type PostgresStateRow = {
  handle: string;
  type: string;
  tenant_id: string;
  user_id: string;
  status: "active" | "completed" | "expired";
  value: unknown;
  version: number;
  created_at: Date | string;
  updated_at: Date | string;
  expires_at: Date | string;
};

export type PostgresStateStoreOptions = {
  tableName?: string;
  client: PostgresClientLike;
  now?: () => Date;
};

export class PostgresStateStore<TState> implements StateStore<TState> {
  private readonly tableName: string;
  private readonly eventsTableName: string;
  private readonly now: () => Date;

  constructor(private readonly options: PostgresStateStoreOptions) {
    const tableName = options.tableName ?? "mcp_state";
    this.tableName = quoteIdentifier(tableName);
    this.eventsTableName = quoteIdentifier(`${tableName}_events`);
    this.now = options.now ?? (() => new Date());
  }

  static fromEnv<TState>(input: {
    connectionString: string;
    tableName?: string;
  }): PostgresStateStore<TState> {
    return new PostgresStateStore<TState>({
      tableName: input.tableName,
      client: new pg.Pool({ connectionString: input.connectionString })
    });
  }

  async create(input: CreateStateInput<TState>): Promise<StateRecord<TState>> {
    const timestamp = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + input.ttlMs).toISOString();
    const handle = createHandle(input.handlePrefix ?? input.type);

    try {
      const result = await this.options.client.query<PostgresStateRow>(
        `INSERT INTO ${this.tableName}
          (handle, type, tenant_id, user_id, status, value, version, created_at, updated_at, expires_at)
         VALUES ($1, $2, $3, $4, 'active', $5::jsonb, 1, $6, $6, $7)
         RETURNING *`,
        [
          handle,
          input.type,
          input.scope.tenantId,
          input.scope.userId,
          JSON.stringify(input.value),
          timestamp,
          expiresAt
        ]
      );

      return rowToRecord<TState>(result.rows[0]);
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }

  async get(handle: string, scope: StateScope): Promise<StateRecord<TState> | null> {
    const record = await this.load(handle);
    if (!record) {
      return null;
    }

    assertScope(record, scope);
    assertActive(record, this.now());
    return record;
  }

  async patch(
    handle: string,
    scope: StateScope,
    patch: Partial<TState>,
    options?: { expectedVersion?: number }
  ): Promise<StateRecord<TState>> {
    const record = await this.load(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    assertScope(record, scope);
    assertActive(record, this.now());

    if (options?.expectedVersion !== undefined && record.version !== options.expectedVersion) {
      throw new StateStoreError(
        "version_conflict",
        `Expected version ${options.expectedVersion}, found ${record.version}.`
      );
    }

    const updatedAt = this.now().toISOString();
    const nextValue = { ...record.value, ...structuredClone(patch) };

    try {
      const result = await this.options.client.query<PostgresStateRow>(
        `UPDATE ${this.tableName}
           SET value = $5::jsonb,
               version = version + 1,
               updated_at = $6
         WHERE handle = $1
           AND tenant_id = $2
           AND user_id = $3
           AND version = $4
           AND status = 'active'
           AND expires_at > $7
         RETURNING *`,
        [
          handle,
          scope.tenantId,
          scope.userId,
          record.version,
          JSON.stringify(nextValue),
          updatedAt,
          this.now().toISOString()
        ]
      );

      if (result.rows.length === 0) {
        throw new StateStoreError("version_conflict", "State record changed before patch applied.");
      }

      return rowToRecord<TState>(result.rows[0]);
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }

  async appendEvent(handle: string, scope: StateScope, event: StateEvent): Promise<void> {
    const record = await this.load(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    assertScope(record, scope);
    assertActive(record, this.now());

    try {
      const result = await this.options.client.query(
        `INSERT INTO ${this.eventsTableName} (handle, tenant_id, user_id, type, at, data)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          handle,
          scope.tenantId,
          scope.userId,
          event.type,
          event.at,
          JSON.stringify(event.data ?? null)
        ]
      );

      if (result.rowCount === 0) {
        throw new StateStoreError("adapter_unavailable", "Postgres did not append state event.");
      }
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }

  async expire(handle: string, scope: StateScope): Promise<void> {
    const record = await this.load(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    assertScope(record, scope);
    const timestamp = this.now().toISOString();

    try {
      const result = await this.options.client.query(
        `UPDATE ${this.tableName}
           SET status = 'expired',
               expires_at = $4,
               updated_at = $4
         WHERE handle = $1
           AND tenant_id = $2
           AND user_id = $3`,
        [handle, scope.tenantId, scope.userId, timestamp]
      );

      if (result.rowCount === 0) {
        throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
      }
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }

  private async load(handle: string): Promise<StateRecord<TState> | null> {
    try {
      const result = await this.options.client.query<PostgresStateRow>(
        `SELECT * FROM ${this.tableName} WHERE handle = $1`,
        [handle]
      );

      return result.rows[0] ? rowToRecord<TState>(result.rows[0]) : null;
    } catch (error) {
      throw normalizePostgresError(error);
    }
  }
}

export function postgresSchema(tableName = "mcp_state"): string {
  const stateTable = quoteIdentifier(tableName);
  const eventsTable = quoteIdentifier(`${tableName}_events`);
  const scopeIndex = quoteIdentifier(`${tableName}_scope_idx`);
  const expiryIndex = quoteIdentifier(`${tableName}_expiry_idx`);
  return `CREATE TABLE IF NOT EXISTS ${stateTable} (
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

CREATE INDEX IF NOT EXISTS ${scopeIndex} ON ${stateTable} (tenant_id, user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS ${expiryIndex} ON ${stateTable} (expires_at);

CREATE TABLE IF NOT EXISTS ${eventsTable} (
  id bigserial PRIMARY KEY,
  handle text NOT NULL REFERENCES ${stateTable}(handle) ON DELETE CASCADE,
  tenant_id text NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL,
  at timestamptz NOT NULL,
  data jsonb
);`;
}

function rowToRecord<TState>(row: PostgresStateRow): StateRecord<TState> {
  return {
    handle: row.handle,
    type: row.type,
    tenantId: row.tenant_id,
    userId: row.user_id,
    status: row.status,
    value: structuredClone(row.value as TState),
    version: row.version,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    expiresAt: toIsoString(row.expires_at)
  };
}

function assertScope<TState>(record: StateRecord<TState>, scope: StateScope): void {
  if (record.tenantId !== scope.tenantId || record.userId !== scope.userId) {
    throw new StateStoreError("forbidden", "State handle is not available in this scope.");
  }
}

function assertActive<TState>(record: StateRecord<TState>, now: Date): void {
  if (record.status === "expired" || Date.parse(record.expiresAt) <= now.getTime()) {
    throw new StateStoreError("expired", "State handle has expired.");
  }
}

function normalizePostgresError(error: unknown): StateStoreError {
  if (error instanceof StateStoreError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Postgres adapter unavailable.";
  return new StateStoreError("adapter_unavailable", message);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function quoteIdentifier(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`Invalid Postgres identifier: ${value}`);
  }
  return `"${value}"`;
}
