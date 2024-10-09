# bazario-api

API for the Bazario marketplace: buyers browse and order products from independent sellers.

## Stack

- Node 20, Express 4, TypeScript
- PostgreSQL via `pg` + Kysely
- Zod for validation, JWT auth

## Development

You need Postgres running locally (or use the compose file in bazario-infra).

```sh
cp .env.example .env
npm install
npm run migrate
npm run dev
```

## Tests

```sh
npm run test:db
npm test
```
