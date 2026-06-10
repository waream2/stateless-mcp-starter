# Explicit Handles

Stateless MCP does not mean your application has no state. It means MCP protocol handling should not hide workflow state in transport sessions.

This starter uses explicit application handles:

1. A tool creates application state.
2. The server stores that state through `StateStore<TState>`.
3. The tool returns an opaque handle such as `cart_...`.
4. Later tool calls pass the handle back as a normal argument.

The cart handle is not the product. It is just a familiar example of a multi-turn workflow. You can use the same pattern for `booking_id`, `ticket_id`, `quote_id`, `approval_id`, `draft_id`, or any other domain handle.

Example:

```json
{
  "cart_id": "cart_abc123"
}
```

Later:

```json
{
  "cart_id": "cart_abc123",
  "sku": "ceramic-mug",
  "quantity": 2
}
```

## Rules

- Handles are identifiers, not authorization.
- Every state read/write also receives `tenantId` and `userId`.
- Handles should be opaque and prefixed only for debugging.
- State records should include TTL and version fields.
- Tool descriptions should tell the model which handle to preserve for later calls.

## Why This Scales

Any server instance can handle any MCP request because the request contains the handle and the shared state adapter contains the state. There is no need for load-balancer affinity or hidden MCP session state.
