import type { Request, RequestHandler, Response, Router } from 'express';
import type { ZodTypeAny, z } from 'zod';
import type { UserRole } from '../db/types.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/auth.js';
import { bearerAuth, ErrorSchema, registry } from '../openapi/registry.js';
import { ah } from './async-handler.js';
import { body as parseBody, params as parseParams, query as parseQuery } from './validate.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface ResponseDef {
  description: string;
  schema?: ZodTypeAny;
  contentType?: string;
}

export interface RouteDef<
  P extends ZodTypeAny | undefined,
  Q extends ZodTypeAny | undefined,
  B extends ZodTypeAny | undefined,
> {
  method: Method;
  /** OpenAPI-style path relative to the router mount point, e.g. /products/{id} */
  path: string;
  summary: string;
  tags: string[];
  auth?: 'required' | 'optional';
  roles?: UserRole[];
  params?: P;
  query?: Q;
  body?: B;
  /** Request content type when not JSON (e.g. multipart/form-data). */
  bodyContentType?: string;
  status?: number;
  responses: Record<number, ResponseDef>;
  middleware?: RequestHandler[];
}

type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

export interface RouteContext<P, Q, B> {
  req: Request;
  res: Response;
  params: P;
  query: Q;
  body: B;
  user: NonNullable<Request['user']>;
}

/**
 * Registers an Express route and documents it in the OpenAPI registry from the
 * same zod schemas, so the published spec cannot drift from what we validate.
 */
export function route<
  P extends ZodTypeAny | undefined = undefined,
  Q extends ZodTypeAny | undefined = undefined,
  B extends ZodTypeAny | undefined = undefined,
>(
  router: Router,
  mount: string,
  def: RouteDef<P, Q, B>,
  handler: (ctx: RouteContext<Infer<P>, Infer<Q>, Infer<B>>) => Promise<unknown>,
) {
  const expressPath = def.path.replace(/\{(\w+)\}/g, ':$1') || '/';
  const middleware: RequestHandler[] = [];
  if (def.auth === 'required' || def.roles) middleware.push(requireAuth);
  else if (def.auth === 'optional') middleware.push(optionalAuth);
  if (def.roles) middleware.push(requireRole(...def.roles));
  middleware.push(...(def.middleware ?? []));

  router[def.method](
    expressPath,
    ...middleware,
    ah(async (req, res) => {
      const ctx = {
        req,
        res,
        params: (def.params ? parseParams(req, def.params) : undefined) as Infer<P>,
        query: (def.query ? parseQuery(req, def.query) : undefined) as Infer<Q>,
        body: (def.body && !def.bodyContentType ? parseBody(req, def.body) : undefined) as Infer<B>,
        user: req.user as NonNullable<Request['user']>,
      };
      const result = await handler(ctx);
      if (res.headersSent) return;
      if (result === undefined) {
        res.status(def.status ?? 204).end();
        return;
      }
      res.status(def.status ?? 200).json(result);
    }),
  );

  const responses: Record<string, unknown> = {};
  for (const [status, r] of Object.entries(def.responses)) {
    responses[status] = r.schema
      ? { description: r.description, content: { [r.contentType ?? 'application/json']: { schema: r.schema } } }
      : { description: r.description };
  }
  if (def.auth === 'required' || def.roles) {
    responses['401'] ??= { description: 'Not authenticated', content: { 'application/json': { schema: ErrorSchema } } };
  }
  if (def.params || def.query || def.body) {
    responses['400'] ??= { description: 'Invalid request', content: { 'application/json': { schema: ErrorSchema } } };
  }

  registry.registerPath({
    method: def.method,
    path: `${mount}${def.path}`,
    summary: def.summary,
    tags: def.tags,
    security: def.auth === 'required' || def.roles ? [{ [bearerAuth.name]: [] }] : undefined,
    request: {
      params: def.params as never,
      query: def.query as never,
      body: def.body
        ? { content: { [def.bodyContentType ?? 'application/json']: { schema: def.body } }, required: true }
        : undefined,
    },
    responses: responses as never,
  });
}
