import { PostgresClientLike, PostgresQueryResult } from "../src/state/postgresStore.js";

type Row = {
  handle: string;
  type: string;
  tenant_id: string;
  user_id: string;
  status: "active" | "completed" | "expired";
  value: unknown;
  version: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export class FakePostgresClient implements PostgresClientLike {
  readonly rows = new Map<string, Row>();
  readonly events: unknown[] = [];
  failQueries = false;

  async query<T = unknown>(text: string, values: unknown[] = []): Promise<PostgresQueryResult<T>> {
    if (this.failQueries) {
      throw new Error("fake postgres unavailable");
    }

    const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
    if (normalized.startsWith("insert into") && normalized.includes("_events")) {
      return this.insertEvent(values) as PostgresQueryResult<T>;
    }
    if (normalized.startsWith("insert into")) {
      return this.insertState(values) as PostgresQueryResult<T>;
    }
    if (normalized.startsWith("select")) {
      return this.selectState(values) as PostgresQueryResult<T>;
    }
    if (normalized.startsWith("update") && normalized.includes("version = version + 1")) {
      return this.patchState(values) as PostgresQueryResult<T>;
    }
    if (normalized.startsWith("update") && normalized.includes("status = 'expired'")) {
      return this.expireState(values) as PostgresQueryResult<T>;
    }

    throw new Error(`Unsupported fake Postgres query: ${text}`);
  }

  private insertState(values: unknown[]): PostgresQueryResult<Row> {
    const [handle, type, tenantId, userId, valueJson, timestamp, expiresAt] = values;
    const row: Row = {
      handle: handle as string,
      type: type as string,
      tenant_id: tenantId as string,
      user_id: userId as string,
      status: "active",
      value: JSON.parse(valueJson as string),
      version: 1,
      created_at: timestamp as string,
      updated_at: timestamp as string,
      expires_at: expiresAt as string
    };

    this.rows.set(row.handle, row);
    return { rows: [structuredClone(row)], rowCount: 1 };
  }

  private selectState(values: unknown[]): PostgresQueryResult<Row> {
    const [handle] = values;
    const row = this.rows.get(handle as string);
    return { rows: row ? [structuredClone(row)] : [], rowCount: row ? 1 : 0 };
  }

  private patchState(values: unknown[]): PostgresQueryResult<Row> {
    const [handle, tenantId, userId, expectedVersion, valueJson, updatedAt, now] = values;
    const row = this.rows.get(handle as string);
    if (
      !row ||
      row.tenant_id !== tenantId ||
      row.user_id !== userId ||
      row.version !== expectedVersion ||
      row.status !== "active" ||
      row.expires_at <= (now as string)
    ) {
      return { rows: [], rowCount: 0 };
    }

    row.value = JSON.parse(valueJson as string);
    row.version += 1;
    row.updated_at = updatedAt as string;
    return { rows: [structuredClone(row)], rowCount: 1 };
  }

  private insertEvent(values: unknown[]): PostgresQueryResult {
    this.events.push(structuredClone(values));
    return { rows: [], rowCount: 1 };
  }

  private expireState(values: unknown[]): PostgresQueryResult {
    const [handle, tenantId, userId, timestamp] = values;
    const row = this.rows.get(handle as string);
    if (!row || row.tenant_id !== tenantId || row.user_id !== userId) {
      return { rows: [], rowCount: 0 };
    }

    row.status = "expired";
    row.expires_at = timestamp as string;
    row.updated_at = timestamp as string;
    return { rows: [], rowCount: 1 };
  }
}
