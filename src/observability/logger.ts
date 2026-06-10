export type LogLevel = "info" | "warn" | "error";

export type Logger = {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
};

export function createLogger(baseFields: Record<string, unknown> = {}): Logger {
  return {
    info: (fields, message) => writeLog("info", baseFields, fields, message),
    warn: (fields, message) => writeLog("warn", baseFields, fields, message),
    error: (fields, message) => writeLog("error", baseFields, fields, message)
  };
}

function writeLog(
  level: LogLevel,
  baseFields: Record<string, unknown>,
  fields: Record<string, unknown>,
  message: string
): void {
  const payload = {
    level,
    message,
    time: new Date().toISOString(),
    ...baseFields,
    ...redact(fields)
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    redacted[key] = /token|authorization|secret|password/i.test(key) ? "[redacted]" : value;
  }
  return redacted;
}

export function errorFields(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message
    };
  }
  return { errorMessage: "Unknown error" };
}
