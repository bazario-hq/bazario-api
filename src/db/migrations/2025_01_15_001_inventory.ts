import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('products')
    .addColumn('low_stock_threshold', 'integer', (col) => col.notNull().defaultTo(5))
    .execute();

  await db.schema
    .createTable('inventory_adjustments')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('product_id', 'bigint', (col) => col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('delta', 'integer', (col) => col.notNull())
    .addColumn('stock_after', 'integer', (col) => col.notNull())
    .addColumn('reason', 'text', (col) => col.notNull())
    .addColumn('actor_id', 'bigint', (col) => col.references('users.id'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createIndex('inventory_adjustments_product_id_idx')
    .on('inventory_adjustments')
    .column('product_id')
    .execute();
}
