# Migration From Sessions

Use this guide when moving an MCP server away from sticky sessions or hidden protocol/session state.

The examples use a shopping cart because it is easy to understand, not because this starter is ecommerce-specific. Substitute your own workflow state and handle names.

## Before

A session-oriented flow often looks like this:

1. Request lands on instance A.
2. Instance A stores cart/workflow state in memory or protocol session state.
3. Later requests must return to instance A, or every instance must synchronize session state.

This creates operational pressure for sticky sessions and custom state replication.

## After

An explicit-handle flow looks like this:

1. `create_cart` writes a cart record through `StateStore`.
2. `create_cart` returns `cart_id`.
3. `add_cart_item` receives `cart_id` and loads state through `StateStore`.
4. `get_cart` receives `cart_id` and loads state through `StateStore`.

Any instance can serve any step.

## Migration Checklist

- Identify state currently stored in MCP session/protocol objects.
- Move that state into a typed application state record.
- Add an opaque handle field such as `cart_id`, `workflow_id`, or `draft_id`.
- Require later tools to accept that handle explicitly.
- Scope state operations by authenticated `tenantId` and `userId`.
- Add TTL and version fields to state records.
- Add tests that simulate multiple instances sharing one state adapter.
- Disable sticky-session assumptions in deployment docs and load balancer config.

## Common Pitfalls

- Do not treat handles as secrets.
- Do not store user or tenant identity inside the handle alone.
- Do not keep a required fallback cache in process memory.
- Do not make the model infer hidden state; return the handle in tool output.
