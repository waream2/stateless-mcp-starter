# Release Checklist

Use this before publishing a new npm version, pushing a release tag, or creating a GitHub release.

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

- Only maintainers should publish npm packages.
- Only tag releases after the package contents and generated starter have been reviewed.
- Keep the GitHub release notes focused on user-visible changes and migration notes.
