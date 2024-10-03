import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('cart_items')
    .addColumn('user_id', 'bigint', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('product_id', 'bigint', (col) => col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('quantity', 'integer', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('cart_items_pkey', ['user_id', 'product_id'])
    .addCheckConstraint('cart_items_quantity_check', sql`quantity > 0`)
    .execute();

  await db.schema
    .createTable('wishlist_items')
    .addColumn('user_id', 'bigint', (col) => col.notNull().references('users.id').onDelete('cascade'))
    .addColumn('product_id', 'bigint', (col) => col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint('wishlist_items_pkey', ['user_id', 'product_id'])
    .execute();
}
