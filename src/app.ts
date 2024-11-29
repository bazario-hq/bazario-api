import express, { Router } from 'express';
import { config } from './config.js';
import { sql } from 'kysely';
import { db } from './db/index.js';
import { registry as metricsRegistry } from './lib/metrics.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { metricsMiddleware } from './middleware/metrics.js';
import { requestLogger } from './middleware/request-logger.js';
import { generateOpenApiDocument } from './openapi/registry.js';
import { apiRouter } from './routes.js';
import { imagesRouter } from './modules/images/images.routes.js';
import { version } from './lib/version.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('trust proxy', 1);

  // Infra endpoints stay outside the request logger and metrics.
  const infra = Router();
  infra.get('/health', async (_req, res) => {
    try {
      await sql`select 1`.execute(db);
      res.json({ status: 'ok', version: version });
    } catch {
      res.status(503).json({ status: 'unavailable' });
    }
  });
  infra.get('/metrics', async (_req, res) => {
    res.set('Content-Type', metricsRegistry.contentType);
    res.send(await metricsRegistry.metrics());
  });
  infra.get('/openapi.json', (_req, res) => {
    res.json(generateOpenApiDocument(version));
  });
  app.use(infra);

  app.use(express.json({ limit: '1mb' }));
  app.use(requestLogger);
  app.use(metricsMiddleware);

  app.use('/images', imagesRouter);
  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
