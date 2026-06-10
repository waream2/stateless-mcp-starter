import { InMemoryStateStore } from "../src/state/memoryStore.js";
import { describeStateStoreContract } from "./state-store-contract.js";

describeStateStoreContract(
  "InMemoryStateStore",
  (clock) => new InMemoryStateStore(() => clock.now)
);
