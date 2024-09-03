import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileMigrationProvider, Kysely, Migrator } from 'kysely';

const migrationFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export function createMigrator(db: Kysely<any>) {
  return new Migrator({
    db,
    provider: new FileMigrationProvider({ fs, path, migrationFolder }),
  });
}

export async function migrateToLatest(db: Kysely<any>) {
  const { error, results } = await createMigrator(db).migrateToLatest();
  return { error, results: results ?? [] };
}
