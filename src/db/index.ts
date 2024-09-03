import pg from 'pg';
import { Kysely, PostgresDialect } from 'kysely';
import { config } from '../config.js';
import { logger } from '../lib/logger.js';
import type { Database } from './types.js';

export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,
  idleTimeoutMillis: 1000,
  application_name: 'bazario-api',
});

pool.on('error', (err) => {
  logger.error({ err }, 'unexpected error on idle postgres client');
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});

export async function closeDb() {
  await db.destroy();
}
