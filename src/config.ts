export type AppConfig = {
  port: number;
  host: string;
  nodeEnv: string;
  stateAdapter: "memory" | "dynamodb" | "postgres";
  auth: {
    mode: "dev" | "bearer";
    bearerToken?: string;
  };
  dynamodb: {
    tableName?: string;
    region?: string;
    endpoint?: string;
  };
  postgres: {
    connectionString?: string;
    tableName: string;
  };
};

export function readConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const authMode = parseAuthMode(env.AUTH_MODE);
  if (env.NODE_ENV === "production" && authMode === "dev") {
    throw new Error("AUTH_MODE=dev is not allowed when NODE_ENV=production.");
  }

  if (authMode === "bearer" && !env.AUTH_BEARER_TOKEN) {
    throw new Error("AUTH_BEARER_TOKEN is required when AUTH_MODE=bearer.");
  }

  const stateAdapter = parseStateAdapter(env.STATE_ADAPTER);
  if (stateAdapter === "dynamodb" && !env.DYNAMODB_TABLE_NAME) {
    throw new Error("DYNAMODB_TABLE_NAME is required when STATE_ADAPTER=dynamodb.");
  }
  if (stateAdapter === "postgres" && !env.POSTGRES_CONNECTION_STRING) {
    throw new Error("POSTGRES_CONNECTION_STRING is required when STATE_ADAPTER=postgres.");
  }

  return {
    port: Number(env.PORT ?? 3000),
    host: env.HOST ?? "127.0.0.1",
    nodeEnv: env.NODE_ENV ?? "development",
    stateAdapter,
    auth: {
      mode: authMode,
      bearerToken: env.AUTH_BEARER_TOKEN
    },
    dynamodb: {
      tableName: env.DYNAMODB_TABLE_NAME,
      region: env.AWS_REGION,
      endpoint: env.DYNAMODB_ENDPOINT
    },
    postgres: {
      connectionString: env.POSTGRES_CONNECTION_STRING,
      tableName: env.POSTGRES_TABLE_NAME ?? "mcp_state"
    }
  };
}

function parseStateAdapter(value: string | undefined): AppConfig["stateAdapter"] {
  if (value === undefined || value === "memory") {
    return "memory";
  }
  if (value === "dynamodb") {
    return "dynamodb";
  }
  if (value === "postgres") {
    return "postgres";
  }
  throw new Error(`Unsupported STATE_ADAPTER: ${value}`);
}

function parseAuthMode(value: string | undefined): AppConfig["auth"]["mode"] {
  if (value === undefined || value === "dev") {
    return "dev";
  }
  if (value === "bearer") {
    return "bearer";
  }
  throw new Error(`Unsupported AUTH_MODE: ${value}`);
}
