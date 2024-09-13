import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import S3rver from 's3rver';
import type { GlobalSetupContext } from 'vitest/node';
import { migrateToLatest } from '../../src/db/migrator.js';
import { databaseUrl, TEMPLATE_DB, TEST_BUCKET, TEST_DATABASE_URL } from './constants.js';

async function admin<T>(fn: (client: pg.Client) => Promise<T>) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Builds a migrated template database once; each test file clones it. */
async function buildTemplate() {
  await admin(async (c) => {
    await c.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
    await c.query(`CREATE DATABASE ${TEMPLATE_DB}`);
  });
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: databaseUrl(TEMPLATE_DB), max: 1 }) }),
  });
  const { error } = await migrateToLatest(db);
  await db.destroy();
  if (error) throw error;
}

export default async function setup({ provide }: GlobalSetupContext) {
  try {
    await buildTemplate();
  } catch (err) {
    throw new Error(
      `Could not prepare the test database at ${TEST_DATABASE_URL}. Is Postgres running? Try \`npm run test:db\`.\n${err}`,
    );
  }

  const dir = mkdtempSync(path.join(os.tmpdir(), 'bazario-s3-'));
  const s3 = new S3rver({
    port: 0,
    address: '127.0.0.1',
    silent: true,
    directory: dir,
    configureBuckets: [{ name: TEST_BUCKET, configs: [] }],
  });
  const { port } = (await s3.run()) as { port: number };
  provide('s3Endpoint', `http://127.0.0.1:${port}`);

  return async () => {
    await s3.close();
    rmSync(dir, { recursive: true, force: true });
  };
}

declare module 'vitest' {
  export interface ProvidedContext {
    s3Endpoint: string;
  }
}
