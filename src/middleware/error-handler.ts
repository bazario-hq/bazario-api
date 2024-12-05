import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

interface PgError extends Error {
  code?: string;
  constraint?: string;
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'not_found', message: 'Route not found' } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Invalid request', details: err.flatten() } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { code: 'bad_request', message: err.message } });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: { code: 'bad_request', message: 'Malformed JSON body' } });
  }
  const pgErr = err as PgError;
  if (pgErr?.code === '23505') {
    return res.status(409).json({ error: { code: 'conflict', message: 'Resource already exists' } });
  }

  logger.error({ err, path: req.path }, 'unhandled error');
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong' } });
}
