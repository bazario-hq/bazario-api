import express, { Router } from 'express';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { version } from './lib/version.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('trust proxy', 1);

  // Infra endpoints stay outside the request logger and metrics.
  const infra = Router();
  infra.get('/health', (_req, res) => {
    res.json({ status: 'ok', version: version });
  });
  app.use(infra);

  app.use(express.json({ limit: '1mb' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
