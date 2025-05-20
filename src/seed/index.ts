// Generates a deterministic dataset for dev, staging or prod-sim.
//
//   npm run seed -- --size=dev --reset
//   node dist/seed/index.js --size=staging --reset --manifest=/out/manifest.staging.json
//   node dist/seed/index.js --size=prod-sim --grow=1      (one "the business grew" step)
//
// Options:
//   --size=dev|staging|prod-sim   dataset size (default dev)
//   --reset                       drop and recreate the schema first (destroys data)
//   --grow=N                      add growth step N on top of an existing dataset
//   --no-images                   skip generating/uploading product photos
//   --images-only                 only upload product photos
//   --seed=N                      random seed (default 20240902)
//   --anchor=ISO date             "now" for the generated history (default: current time)
//   --manifest=path               where to write the load-generator manifest
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../config.js';
import { closeDb, db } from '../db/index.js';
import { migrateToLatest } from '../db/migrator.js';
import { SeedGenerator } from './generate.js';
import { uploadImagePool } from './images.js';
import { buildManifest } from './manifest.js';
import { SIZES, type SeedSize } from './sizes.js';

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const size = String(args.size ?? 'dev') as SeedSize;
if (!(size in SIZES)) {
  console.error(`Unknown size "${size}". Use dev, staging or prod-sim.`);
  process.exit(2);
}
const seed = Number(args.seed ?? 20240902);
const anchor = args.anchor ? Date.parse(String(args.anchor)) : Date.now();
const grow = args.grow ? Number(args.grow) : 0;
const manifestPath = args.manifest ? String(args.manifest) : `seed-manifest.${size}.json`;
const started = Date.now();
const log = (msg: string) => console.log(`[seed ${((Date.now() - started) / 1000).toFixed(0).padStart(4)}s] ${msg}`);

const admin = new pg.Client({ connectionString: config.DATABASE_URL, application_name: 'bazario-seed' });
await admin.connect();

try {
  if (args.reset) {
    log('dropping schema public');
    await admin.query('drop schema public cascade');
    await admin.query('create schema public');
    for (const ext of ['pg_trgm', 'pgcrypto']) await admin.query(`create extension if not exists ${ext}`).catch(() => undefined);
  }
  const { error } = await migrateToLatest(db);
  if (error) throw error;

  const generator = new SeedGenerator({ size, seed, anchor, log });

  if (!args['images-only']) {
    const [{ n }] = (await admin.query<{ n: number }>('select count(*)::int as n from users')).rows;
    if (grow) {
      if (n === 0) throw new Error('--grow needs an existing dataset; run a full seed first');
      log(`growth step ${grow} for ${size}`);
      await generator.grow(admin, grow);
    } else {
      if (n > 0) throw new Error('The database already has data. Re-run with --reset to replace it.');
      log(`generating ${size} dataset (seed ${seed}, anchor ${new Date(anchor).toISOString()})`);
      await generator.generate(admin);
    }
  }

  if (!args['no-images']) {
    log(`uploading ${generator.imagePool.length} product photos to ${config.S3_ENDPOINT}/${config.S3_BUCKET}`);
    const { uploaded, bytes } = await uploadImagePool(seed, generator.imagePool, log);
    if (uploaded) log(`uploaded ${uploaded} photos (${(bytes / 1024 / 1024).toFixed(0)} MB)`);
  }

  if (!args['images-only']) {
    const manifest = await buildManifest(admin, size, seed);
    mkdirSync(path.dirname(path.resolve(manifestPath)), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
    log(`wrote load-generator manifest to ${manifestPath}`);
  }

  const counts = await admin.query<{ table: string; rows: number }>(`
    select relname as table, n_live_tup::int as rows from pg_stat_user_tables
     where relname not like 'kysely%' order by n_live_tup desc`);
  const [{ size: dbSize }] = (await admin.query<{ size: string }>('select pg_size_pretty(pg_database_size(current_database())) as size')).rows;
  for (const c of counts.rows) log(`  ${c.table.padEnd(24)} ${c.rows.toLocaleString('en-US').padStart(12)}`);
  const peakRss = process.resourceUsage().maxRSS / 1024;
  log(`database size ${dbSize}; peak generator memory ${peakRss.toFixed(0)} MB; done in ${((Date.now() - started) / 60_000).toFixed(1)} min`);
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await admin.end();
  await closeDb();
}
