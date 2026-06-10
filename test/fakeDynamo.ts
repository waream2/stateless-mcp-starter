import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDbClientLike } from "../src/state/dynamoStore.js";

export class FakeDynamoClient implements DynamoDbClientLike {
  readonly items = new Map<string, Record<string, unknown>>();
  failRequests = false;

  async send(command: { input?: Record<string, unknown>; constructor: { name: string } }) {
    if (this.failRequests) {
      throw new Error("fake dynamodb unavailable");
    }

    const input = command.input ?? {};

    if (command.constructor.name === "PutItemCommand") {
      return this.put(input);
    }

    if (command.constructor.name === "GetItemCommand") {
      return this.get(input);
    }

    if (command.constructor.name === "UpdateItemCommand") {
      return this.update(input);
    }

    throw new Error(`Unsupported fake DynamoDB command: ${command.constructor.name}`);
  }

  private put(input: Record<string, unknown>) {
    const item = unmarshall(input.Item as Record<string, never>) as Record<string, unknown>;
    const handle = item.handle as string;
    if (this.items.has(handle)) {
      throw conditionalCheckFailed();
    }
    this.items.set(handle, input.Item as Record<string, unknown>);
    return {};
  }

  private get(input: Record<string, unknown>) {
    const key = unmarshall(input.Key as Record<string, never>) as { handle: string };
    return {
      Item: this.items.get(key.handle)
    };
  }

  private update(input: Record<string, unknown>) {
    const key = unmarshall(input.Key as Record<string, never>) as { handle: string };
    const current = this.items.get(key.handle);
    if (!current) {
      throw conditionalCheckFailed();
    }

    const item = unmarshall(current as Record<string, never>) as Record<string, unknown>;
    const values = unmarshall(
      input.ExpressionAttributeValues as Record<string, never>
    ) as Record<string, unknown>;
    const expression = input.UpdateExpression as string;

    this.assertCondition(item, values, input.ConditionExpression as string | undefined);

    if (expression.includes("#value")) {
      item.value = values[":value"];
      item.version = values[":nextVersion"];
      item.updatedAt = values[":updatedAt"];
    } else if (expression.includes("list_append")) {
      item.events = [...((item.events as unknown[]) ?? []), ...(values[":event"] as unknown[])];
    } else if (expression.includes("#status")) {
      item.status = values[":expired"];
      item.expiresAt = values[":expiresAt"];
      item.expiresAtEpoch = values[":expiresAtEpoch"];
      item.updatedAt = values[":updatedAt"];
    }

    const marshalled = marshall(item, { removeUndefinedValues: true }) as Record<string, unknown>;
    this.items.set(key.handle, marshalled);

    return input.ReturnValues === "ALL_NEW" ? { Attributes: marshalled } : {};
  }

  private assertCondition(
    item: Record<string, unknown>,
    values: Record<string, unknown>,
    expression: string | undefined
  ): void {
    if (!expression) {
      return;
    }

    if (expression.includes("#tenantId") && item.tenantId !== values[":tenantId"]) {
      throw conditionalCheckFailed();
    }

    if (expression.includes("#userId") && item.userId !== values[":userId"]) {
      throw conditionalCheckFailed();
    }

    if (expression.includes("#version") && item.version !== values[":expectedVersion"]) {
      throw conditionalCheckFailed();
    }

    if (expression.includes("#status = :active") && item.status !== values[":active"]) {
      throw conditionalCheckFailed();
    }

    if (
      expression.includes("#expiresAt > :now") &&
      typeof item.expiresAt === "string" &&
      typeof values[":now"] === "string" &&
      item.expiresAt <= values[":now"]
    ) {
      throw conditionalCheckFailed();
    }
  }
}

function conditionalCheckFailed(): Error {
  const error = new Error("Conditional request failed");
  error.name = "ConditionalCheckFailedException";
  return error;
}
