import { StateScope } from "../state/StateStore.js";
import { Logger } from "../observability/logger.js";

export type RequestContext = StateScope & {
  requestId: string;
  scopes: string[];
  logger: Logger;
};
