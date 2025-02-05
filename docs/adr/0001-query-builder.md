# ADR 0001: Kysely instead of an ORM

- Status: accepted
- Deciders: API team

## Context

The API is read-heavy with several hand-tuned listing and reporting queries. We want typed queries without hiding the SQL.

## Options

| | Kysely | Prisma | Raw `pg` |
| --- | --- | --- | --- |
| Typed results | yes, from our own table types | yes, generated | no |
| SQL stays visible | yes | mostly | yes |
| Migrations | our own forward-only runner | built in | our own |

## Decision

Kysely over `pg`, with table types maintained in `src/db/types.ts` and a small forward-only migration runner.

## Consequences

Table types are updated by hand next to each migration. Joins and aggregates are written explicitly, so reviewers can read the query a handler runs.
