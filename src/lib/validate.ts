import type { Request } from 'express';
import { z, ZodError, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';

function parse<T extends ZodTypeAny>(schema: T, data: unknown, where: string): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      throw badRequest(`Invalid ${where}`, err.flatten());
    }
    throw err;
  }
}

export const body = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.body, 'request body');
export const query = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.query, 'query string');
export const params = <T extends ZodTypeAny>(req: Request, schema: T) => parse(schema, req.params, 'path parameters');

export const idParam = z.object({ id: z.coerce.number().int().positive() });
