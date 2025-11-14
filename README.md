# bazario-api

The Node/Express API behind the Bazario marketplace: buyers browse, review and order products from independent sellers; sellers manage catalogue, stock, orders and payouts; admins moderate and report.

## Stack

- Node 22, Express 4, TypeScript (ESM)
- PostgreSQL 17 via `pg` + [Kysely](https://kysely.dev) (query builder, SQL stays visible)
- Zod for validation; the OpenAPI spec is generated from the same schemas
- JWT access tokens + rotating refresh tokens, bcrypt password hashes
- S3-compatible object storage (SeaweedFS in bazario-infra) for product images, resized with sharp
- pino for structured logs, prom-client for `/metrics`
- Vitest + Supertest; integration tests run against a real Postgres

## Layout

```
src/
  app.ts, server.ts       Express app and process entrypoint
  migrate.ts              runs pending migrations (node dist/migrate.js)
  config.ts               environment variables (zod-validated)
  db/                     pool, Kysely instance, table types, migrations
  lib/                    auth tokens, storage, mail, payments mock, helpers
  middleware/             auth, logging, metrics, error handling
  modules/<area>/         routes -> services -> repositories per feature
  jobs/                   in-process scheduled jobs
  seed/                   deterministic dataset generator (npm run seed)
  openapi/                registry used to build openapi.json
tests/
  unit/                   no database needed
  integration/            real Postgres + local S3 server
  support/                factories, app harness, global setup
```

## Running locally

The full environment (Postgres, SeaweedFS, Mailpit, monitoring) lives in [`bazario-infra`](https://github.com/bazario-hq/bazario-infra):

```sh
cd ../bazario-infra
make env ENV=dev
make up-app ENV=dev        # api on http://localhost:3000
```

To run the API on your host against the infra services instead:

```sh
cp .env.example .env       # adjust credentials to match infra env/dev.env
npm install
npm run migrate
npm run dev
```

## Seed data

`src/seed` generates a deterministic dataset (fixed random seed) for each environment size:

```sh
npm run seed -- --size=dev --reset          # drops and recreates the schema, then seeds
npm run seed -- --size=staging --reset --no-images
npm run seed -- --size=prod-sim --grow=1    # adds one growth step to an existing dataset
```

| Size | Buyers | Sellers | Products | Orders |
| --- | --- | --- | --- | --- |
| `dev` | 2,000 | 40 | 3,000 | 12,000 |
| `staging` | 60,000 | 400 | 40,000 | 300,000 |
| `prod-sim` | 600,000 | 3,000 | 200,000 | 2,400,000 |

Two years of history with growth, seasonality and a daily traffic curve: a few big sellers with large catalogues, frequent buyers with hundreds of orders, popular products with thousands of reviews, and notifications, wishlists, carts, stock history and payouts to match. Product photos are generated (not downloaded) and uploaded to object storage once per pool. Every seeded account uses the password `bazario-demo`; staff accounts are `admin@`, `ops@` and `trust@bazario.example`.

The seed also writes a manifest (accounts, big sellers, popular products) that the k6 load generator in `bazario-infra` reads. In the Docker environments run it through `make seed ENV=<env>` in `bazario-infra`.

## Tests

```sh
npm run test:db            # starts a throwaway Postgres on :55432 (docker compose)
npm test                   # unit + integration
npm run test:unit
npm run test:integration
```

Integration tests build a migrated template database once, then give each test file its own copy, so files run in parallel. Image uploads go to an in-process S3-compatible server. Point at another Postgres with `TEST_DATABASE_URL`.

## API contract

`openapi.json` is generated from the route definitions (`src/lib/route.ts` registers each route and its schemas together). After changing a route, run:

```sh
npm run openapi
```

The contract test fails if the committed spec is stale. The web app generates its API client from this file. The running API also serves it at `GET /openapi.json`.

## Migrations

Forward-only Kysely migrations live in `src/db/migrations`, named `YYYY_MM_DD_NNN_description.ts`. They run in order on deploy (`make deploy` in bazario-infra runs `node dist/migrate.js` before restarting the API). Never edit a migration that has shipped; add a new one.

## Test accounts and payments

Checkout uses a mock card processor. Any future expiry date works; card `4000 0000 0000 0002` is always declined.
