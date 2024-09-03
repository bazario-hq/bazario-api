import { db } from './db/index.js';
import { migrateToLatest } from './db/migrator.js';
import { logger } from './lib/logger.js';

const { error, results } = await migrateToLatest(db);

for (const r of results) {
  if (r.status === 'Success') logger.info(`migration "${r.migrationName}" applied`);
  else if (r.status === 'Error') logger.error(`migration "${r.migrationName}" failed`);
}
if (results.length === 0 && !error) logger.info('no pending migrations');

await db.destroy();

if (error) {
  logger.error({ err: error }, 'migration failed');
  process.exit(1);
}
