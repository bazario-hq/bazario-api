import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb } from './db/index.js';
import { startJobs, stopJobs } from './jobs/index.js';
import { logger } from './lib/logger.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'bazario-api listening');
});

startJobs();

function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  stopJobs();
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
