export type AppErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "expired"
  | "version_conflict"
  | "adapter_unavailable"
  | "tool_execution_failed";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}
