import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('reviews')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('published'))
    .addColumn('moderated_by', 'bigint', (col) => col.references('users.id'))
    .addColumn('moderated_at', 'timestamptz')
    .addColumn('moderation_note', 'text')
    .execute();

  await sql`alter table reviews add constraint reviews_status_check check (status in ('published', 'pending', 'rejected'))`.execute(
    db,
  );
}
