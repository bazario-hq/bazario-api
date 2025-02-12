# Contributing to bazario-api

## Setup

- Node 20 (see `.nvmrc`) and Docker.
- `npm ci`
- `npm run test:db` starts the Postgres the integration tests use (port 55432).
- `npm run db:reset` recreates your local database, then `npm run migrate` applies migrations.

## Before you open a pull request

    npm run lint
    npm run typecheck
    npm test
    npm run openapi      # if you changed a route or schema; commit openapi.json

CI runs the same checks plus a production image build, and fails if `openapi.json` is stale.

## Conventions

- Branches: `fix/BZR-123-short-name`, `feat/...`, `perf/...`, `chore/...`.
- Conventional Commits; reference the ticket as `BZR-123`.
- Migrations are forward-only: `npm run migrate:make <name>`. Never edit a migration that has shipped.
- Changes to the API contract are visible to bazario-web; breaking ones need a coordinated release (API first, then web).
- Pull requests use the template: root cause, change, evidence, risk and rollback, migration notes, test plan.
- Architecture decisions go in `docs/adr/` (copy `0000-template.md`).
