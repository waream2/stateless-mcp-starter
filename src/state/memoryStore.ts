import { createHandle } from "./handles.js";
import {
  CreateStateInput,
  StateEvent,
  StateRecord,
  StateScope,
  StateStore,
  StateStoreError
} from "./StateStore.js";

type StoredRecord<TState> = StateRecord<TState> & {
  events: StateEvent[];
};

export class InMemoryStateStore<TState> implements StateStore<TState> {
  private readonly records = new Map<string, StoredRecord<TState>>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  async create(input: CreateStateInput<TState>): Promise<StateRecord<TState>> {
    const timestamp = this.now().toISOString();
    const record: StoredRecord<TState> = {
      handle: createHandle(input.handlePrefix ?? input.type),
      type: input.type,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      status: "active",
      value: structuredClone(input.value),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(this.now().getTime() + input.ttlMs).toISOString(),
      events: []
    };

    this.records.set(record.handle, record);
    return this.publicRecord(record);
  }

  async get(handle: string, scope: StateScope): Promise<StateRecord<TState> | null> {
    const record = this.records.get(handle);
    if (!record) {
      return null;
    }

    this.assertScope(record, scope);
    if (this.isExpired(record)) {
      record.status = "expired";
      throw new StateStoreError("expired", "State handle has expired.");
    }

    return this.publicRecord(record);
  }

  async patch(
    handle: string,
    scope: StateScope,
    patch: Partial<TState>,
    options?: { expectedVersion?: number }
  ): Promise<StateRecord<TState>> {
    const record = this.records.get(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    this.assertScope(record, scope);
    this.assertActive(record);

    if (options?.expectedVersion !== undefined && record.version !== options.expectedVersion) {
      throw new StateStoreError(
        "version_conflict",
        `Expected version ${options.expectedVersion}, found ${record.version}.`
      );
    }

    record.value = { ...record.value, ...structuredClone(patch) };
    record.version += 1;
    record.updatedAt = this.now().toISOString();

    return this.publicRecord(record);
  }

  async appendEvent(handle: string, scope: StateScope, event: StateEvent): Promise<void> {
    const record = this.records.get(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    this.assertScope(record, scope);
    this.assertActive(record);
    record.events.push(structuredClone(event));
  }

  async expire(handle: string, scope: StateScope): Promise<void> {
    const record = this.records.get(handle);
    if (!record) {
      throw new StateStoreError("not_found", `No state record found for handle ${handle}.`);
    }

    this.assertScope(record, scope);
    record.status = "expired";
    record.expiresAt = this.now().toISOString();
    record.updatedAt = record.expiresAt;
  }

  private assertScope(record: StateRecord<TState>, scope: StateScope): void {
    if (record.tenantId !== scope.tenantId || record.userId !== scope.userId) {
      throw new StateStoreError("forbidden", "State handle is not available in this scope.");
    }
  }

  private assertActive(record: StateRecord<TState>): void {
    if (this.isExpired(record) || record.status === "expired") {
      record.status = "expired";
      throw new StateStoreError("expired", "State handle has expired.");
    }
  }

  private isExpired(record: StateRecord<TState>): boolean {
    return Date.parse(record.expiresAt) <= this.now().getTime();
  }

  private publicRecord(record: StoredRecord<TState>): StateRecord<TState> {
    const { events: _events, ...publicRecord } = record;
    return structuredClone(publicRecord);
  }
}
