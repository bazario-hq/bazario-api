# ADR 0002: One definition for validation and the OpenAPI spec

- Status: accepted
- Deciders: API team, web team

## Context

bazario-web generates its API client from the spec. Hand-written specs drift from the code.

## Decision

Routes are registered through `src/lib/route.ts`, which takes the zod schemas for params, query, body and response and registers both the Express handler and the OpenAPI path. `openapi.json` is committed and a contract test fails when it is stale.

## Consequences

A route cannot exist without a documented schema. Breaking changes show up as a diff in `openapi.json` and fail the web build.
