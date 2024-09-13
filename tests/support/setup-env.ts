import pg from 'pg';
import { inject } from 'vitest';
import { databaseUrl, TEMPLATE_DB, TEST_BUCKET, TEST_DATABASE_URL } from './constants.js';

// Every test file gets its own database cloned from the migrated template, so
// files can run in parallel without seeing each other's rows.
const dbName = `bazario_test_${process.env.VITEST_POOL_ID ?? '0'}`;

const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
await client.connect();
await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
await client.query(`CREATE DATABASE ${dbName} TEMPLATE ${TEMPLATE_DB}`);
await client.end();

Object.assign(process.env, {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
  DATABASE_URL: databaseUrl(dbName),
  DATABASE_POOL_MAX: '5',
  S3_ENDPOINT: inject('s3Endpoint'),
  S3_BUCKET: TEST_BUCKET,
  S3_ACCESS_KEY: 'S3RVER',
  S3_SECRET_KEY: 'S3RVER',
  S3_FORCE_PATH_STYLE: 'true',
  JWT_ACCESS_SECRET: 'test-access-secret',
  JWT_REFRESH_SECRET: 'test-refresh-secret',
  BCRYPT_ROUNDS: '4',
  PAYMENT_LATENCY_MS: '0',
  PUBLIC_API_URL: 'http://api.test',
  SMTP_HOST: '',
});
