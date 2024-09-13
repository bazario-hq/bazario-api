import { expect } from 'vitest';
import type { ZodTypeAny } from 'zod';

/** Asserts a response body matches the documented response schema. */
export function expectSchema(schema: ZodTypeAny, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    expect.fail(`response does not match schema: ${JSON.stringify(result.error.issues.slice(0, 5), null, 2)}`);
  }
}
