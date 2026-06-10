import { CartToolError } from "../cart/cartService.js";
import { AppError, AppErrorCode } from "../errors.js";
import { StateStoreError } from "../state/StateStore.js";

export type ToolPayload = Record<string, unknown>;

export function ok(payload: ToolPayload) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload
  };
}

export function toolError(error: unknown) {
  const payload = normalizeError(error);
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload,
    isError: true
  };
}

function normalizeError(error: unknown) {
  if (error instanceof AppError) {
    return errorPayload(error.code, error.message);
  }

  if (error instanceof StateStoreError) {
    return errorPayload(error.code, error.message);
  }

  if (error instanceof CartToolError) {
    return errorPayload(error.code, error.message);
  }

  return errorPayload(
    "tool_execution_failed",
    error instanceof Error ? error.message : "Unknown tool error."
  );
}

function errorPayload(code: AppErrorCode, message: string) {
  return {
    error: {
      code,
      message
    }
  };
}
