import { randomBytes } from "node:crypto";

export function createHandle(prefix: string): string {
  const normalizedPrefix = prefix.endsWith("_") ? prefix : `${prefix}_`;
  return `${normalizedPrefix}${randomBytes(16).toString("base64url")}`;
}
