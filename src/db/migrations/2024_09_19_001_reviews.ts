import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('reviews')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('product_id', 'bigint', (col) => col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('user_id', 'bigint', (col) => col.notNull().references('users.id'))
    .addColumn('rating', 'smallint', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('body', 'text', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('reviews_rating_check', sql`rating between 1 and 5`)
    .addUniqueConstraint('reviews_product_user_key', ['product_id', 'user_id'])
    .execute();

  await db.schema.createIndex('reviews_product_id_idx').on('reviews').column('product_id').execute();

  await db.schema
    .alterTable('products')
    .addColumn('rating_avg', 'numeric(3, 2)', (col) => col.notNull().defaultTo(0))
    .addColumn('rating_count', 'integer', (col) => col.notNull().defaultTo(0))
    .execute();
}
