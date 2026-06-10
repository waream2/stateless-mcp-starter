import { Logger } from "../src/observability/logger.js";

export const testLogger: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};
