import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { createHandle } from "./handles.js";
import {
  CreateStateInput,
  StateEvent,
  StateRecord,
  StateScope,
  StateStore,
  StateStoreError
} from "./StateStore.js";

export type DynamoDbClientLike = {
  send(command: GetItemCommand | PutItemCommand | UpdateItemCommand): Promise<unknown>;
};

type DynamoStoredRecord<TState> = StateRecord<TState> & {
  events?: StateEvent[];
  expiresAtEpoch: number;
};

export type DynamoStateStoreOptions = {
  tableName: string;
  client: DynamoDbClientLike;
  now?: () => Date;
};

export class DynamoStateStore<TState> implements StateStore<TState> {
  private readonly now: () => Date;

  constructor(private readonly options: DynamoStateStoreOptions) {
    this.now = options.now ?? (() => new Date());
  }

  static fromEnv<TState>(input: {
    tableName: string;
    region?: string;
    endpoint?: string;
  }): DynamoStateStore<TState> {
    return new DynamoStateStore<TState>({
      tableName: input.tableName,
      client: new DynamoDBClient({
        region: input.region,
        endpoint: input.endpoint
      })
    });
  }

  async create(input: CreateStateInput<TState>): Promise<StateRecord<TState>> {
    const timestamp = this.now().toISOString();
    const expiresAt = new Date(this.now().getTime() + input.ttlMs).toISOString();
    const record: DynamoStoredRecord<TState> = {
      handle: createHandle(input.handlePrefix ?? input.type),
      type: input.type,
      tenantId: input.scope.tenantId,
      userId: input.scope.userId,
      status: "active",
      value: structuredClone(input.value),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt,
      expiresAtEpoch: toEpochSeconds(expiresAt),
      events: []
    };

    try {
      await this.options.client.send(
        new PutItemCommand({
          TableName: this.options.tableName,
          Item: marshall(record, { removeUndefinedValues: true }),
          ConditionExpression: "attribute_not_exists(#handle)",
          ExpressionAttributeNames: {
            "#handle": "handle"
          }
        })
      );
      return publicRecord(record);
    } catch (error) {
      throw normalizeDynamoError(error);
    }
  }

  async get(handle: string, scope: StateScope): Promise<StateRecord<TState> | null> {
    const record = await this.load(handle);
    if (!record) {
      return null;
    }

    assertScope(record, scope);
    assertActive(record, this.now());
    return publicRecord(record);
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
    const nextVersion = record.version + 1;
    const nextValue = { ...record.value, ...structuredClone(patch) };

    try {
      const result = (await this.options.client.send(
        new UpdateItemCommand({
          TableName: this.options.tableName,
          Key: marshall({ handle }),
          ConditionExpression:
            "#tenantId = :tenantId AND #userId = :userId AND #version = :expectedVersion AND #status = :active AND #expiresAt > :now",
          UpdateExpression: "SET #value = :value, #version = :nextVersion, #updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#tenantId": "tenantId",
            "#userId": "userId",
            "#version": "version",
            "#status": "status",
            "#expiresAt": "expiresAt",
            "#value": "value",
            "#updatedAt": "updatedAt"
          },
          ExpressionAttributeValues: marshall({
            ":tenantId": scope.tenantId,
            ":userId": scope.userId,
            ":expectedVersion": record.version,
            ":active": "active",
            ":now": this.now().toISOString(),
            ":value": nextValue,
            ":nextVersion": nextVersion,
            ":updatedAt": updatedAt
          }),
          ReturnValues: "ALL_NEW"
        })
      )) as { Attributes?: Record<string, AttributeValue> };

      if (!result.Attributes) {
        throw new StateStoreError("adapter_unavailable", "DynamoDB did not return updated state.");
      }

      return publicRecord(fromDynamoItem<TState>(result.Attributes));
    } catch (error) {
      if (isConditionalCheckFailed(error)) {
        throw new StateStoreError("version_conflict", "State record changed before patch applied.");
      }
      throw normalizeDynamoError(error);
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
      await this.options.client.send(
        new UpdateItemCommand({
          TableName: this.options.tableName,
          Key: marshall({ handle }),
          ConditionExpression:
            "#tenantId = :tenantId AND #userId = :userId AND #status = :active AND #expiresAt > :now",
          UpdateExpression: "SET #events = list_append(if_not_exists(#events, :empty), :event)",
          ExpressionAttributeNames: {
            "#tenantId": "tenantId",
            "#userId": "userId",
            "#status": "status",
            "#expiresAt": "expiresAt",
            "#events": "events"
          },
          ExpressionAttributeValues: marshall({
            ":tenantId": scope.tenantId,
            ":userId": scope.userId,
            ":active": "active",
            ":now": this.now().toISOString(),
            ":empty": [],
            ":event": [event]
          })
        })
      );
    } catch (error) {
      throw normalizeDynamoError(error);
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
      await this.options.client.send(
        new UpdateItemCommand({
          TableName: this.options.tableName,
          Key: marshall({ handle }),
          ConditionExpression: "#tenantId = :tenantId AND #userId = :userId",
          UpdateExpression:
            "SET #status = :expired, #expiresAt = :expiresAt, #expiresAtEpoch = :expiresAtEpoch, #updatedAt = :updatedAt",
          ExpressionAttributeNames: {
            "#tenantId": "tenantId",
            "#userId": "userId",
            "#status": "status",
            "#expiresAt": "expiresAt",
            "#expiresAtEpoch": "expiresAtEpoch",
            "#updatedAt": "updatedAt"
          },
          ExpressionAttributeValues: marshall({
            ":tenantId": scope.tenantId,
            ":userId": scope.userId,
            ":expired": "expired",
            ":expiresAt": timestamp,
            ":expiresAtEpoch": toEpochSeconds(timestamp),
            ":updatedAt": timestamp
          })
        })
      );
    } catch (error) {
      throw normalizeDynamoError(error);
    }
  }

  private async load(handle: string): Promise<DynamoStoredRecord<TState> | null> {
    try {
      const result = (await this.options.client.send(
        new GetItemCommand({
          TableName: this.options.tableName,
          Key: marshall({ handle })
        })
      )) as { Item?: Record<string, AttributeValue> };

      return result.Item ? fromDynamoItem<TState>(result.Item) : null;
    } catch (error) {
      throw normalizeDynamoError(error);
    }
  }
}

function fromDynamoItem<TState>(item: Record<string, AttributeValue>): DynamoStoredRecord<TState> {
  return unmarshall(item) as DynamoStoredRecord<TState>;
}

function publicRecord<TState>(record: DynamoStoredRecord<TState>): StateRecord<TState> {
  const { events: _events, expiresAtEpoch: _expiresAtEpoch, ...publicRecord } = record;
  return structuredClone(publicRecord);
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

function normalizeDynamoError(error: unknown): StateStoreError {
  if (error instanceof StateStoreError) {
    return error;
  }

  if (isConditionalCheckFailed(error)) {
    return new StateStoreError("version_conflict", "DynamoDB conditional write failed.");
  }

  const message = error instanceof Error ? error.message : "DynamoDB adapter unavailable.";
  return new StateStoreError("adapter_unavailable", message);
}

function isConditionalCheckFailed(error: unknown): boolean {
  return error instanceof Error && error.name === "ConditionalCheckFailedException";
}

function toEpochSeconds(value: string): number {
  return Math.floor(Date.parse(value) / 1000);
}
