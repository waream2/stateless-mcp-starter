export type StateScope = {
  tenantId: string;
  userId: string;
};

export type StateStatus = "active" | "completed" | "expired";

export type StateRecord<TState> = StateScope & {
  handle: string;
  type: string;
  status: StateStatus;
  value: TState;
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type StateEvent = {
  type: string;
  at: string;
  data?: unknown;
};

export type CreateStateInput<TState> = {
  type: string;
  scope: StateScope;
  value: TState;
  ttlMs: number;
  handlePrefix?: string;
};

export interface StateStore<TState> {
  create(input: CreateStateInput<TState>): Promise<StateRecord<TState>>;
  get(handle: string, scope: StateScope): Promise<StateRecord<TState> | null>;
  patch(
    handle: string,
    scope: StateScope,
    patch: Partial<TState>,
    options?: { expectedVersion?: number }
  ): Promise<StateRecord<TState>>;
  appendEvent(handle: string, scope: StateScope, event: StateEvent): Promise<void>;
  expire(handle: string, scope: StateScope): Promise<void>;
}

export class StateStoreError extends Error {
  constructor(
    public readonly code:
      | "not_found"
      | "expired"
      | "forbidden"
      | "version_conflict"
      | "adapter_unavailable",
    message: string
  ) {
    super(message);
    this.name = "StateStoreError";
  }
}
