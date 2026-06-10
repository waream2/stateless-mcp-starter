import { AppConfig } from "../config.js";
import { CartState } from "../cart/types.js";
import { DynamoStateStore } from "./dynamoStore.js";
import { InMemoryStateStore } from "./memoryStore.js";
import { PostgresStateStore } from "./postgresStore.js";
import { StateStore } from "./StateStore.js";

export function createCartStateStore(config: AppConfig): StateStore<CartState> {
  if (config.stateAdapter === "memory") {
    return new InMemoryStateStore<CartState>();
  }

  if (config.stateAdapter === "dynamodb") {
    return DynamoStateStore.fromEnv<CartState>({
      tableName: config.dynamodb.tableName!,
      region: config.dynamodb.region,
      endpoint: config.dynamodb.endpoint
    });
  }

  return PostgresStateStore.fromEnv<CartState>({
    connectionString: config.postgres.connectionString!,
    tableName: config.postgres.tableName
  });
}

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
