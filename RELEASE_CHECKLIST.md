# Release Checklist

Use this before sharing the starter publicly or publishing an npm package. Do not publish or tag a release unless that action is explicitly requested.

## Local Verification

- `pnpm install`
- `pnpm test`
- `pnpm build`
- `docker build -t stateless-mcp-starter .`
- Run `pnpm dev` and verify `/health`.
- Run a Streamable HTTP MCP smoke test for `create_cart`, `add_cart_item`, and `get_cart`.
- Run the generator smoke test and inspect the generated project.

## Package Review

- Confirm `package.json` has the intended name, version, license, bin, files, and keywords.
- Confirm `README.md` explains generator usage and direct clone usage.
- Confirm `.env.example` contains no real secrets.
- Confirm generated projects contain no local paths, machine-specific values, or stale placeholders.
- Confirm `LICENSE` is present.

## Docs Review

- README quickstart works for a new builder.
- `docs/explicit-handles.md` explains the state pattern clearly.
- `docs/adapters.md` documents memory, DynamoDB, and Postgres.
- `docs/deployment.md` says sticky sessions are not required.
- `docs/migration-from-sessions.md` explains how to move off hidden session state.

## Release Guardrails

- Do not publish to npm without explicit approval.
- Do not create a GitHub release without explicit approval.
- Do not push tags without explicit approval.
