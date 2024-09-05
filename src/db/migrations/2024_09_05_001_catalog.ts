import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('categories')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('parent_id', 'bigint', (col) => col.references('categories.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('description', 'text')
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('sellers')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('user_id', 'bigint', (col) => col.notNull().unique().references('users.id'))
    .addColumn('store_name', 'text', (col) => col.notNull())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('description', 'text')
    .addColumn('logo_key', 'text')
    .addColumn('support_email', 'text')
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('pending'))
    .addColumn('approved_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable('products')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('seller_id', 'bigint', (col) => col.notNull().references('sellers.id'))
    .addColumn('category_id', 'bigint', (col) => col.notNull().references('categories.id'))
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('slug', 'text', (col) => col.notNull().unique())
    .addColumn('description', 'text', (col) => col.notNull().defaultTo(''))
    .addColumn('price_cents', 'integer', (col) => col.notNull())
    .addColumn('compare_at_cents', 'integer')
    .addColumn('currency', 'text', (col) => col.notNull().defaultTo('USD'))
    .addColumn('stock', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('draft'))
    .addColumn('specs', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint('products_price_check', sql`price_cents >= 0`)
    .execute();

  await db.schema.createIndex('products_seller_id_idx').on('products').column('seller_id').execute();
  await db.schema.createIndex('products_category_id_idx').on('products').column('category_id').execute();
  await db.schema.createIndex('products_status_idx').on('products').column('status').execute();

  await db.schema
    .createTable('product_images')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('product_id', 'bigint', (col) => col.notNull().references('products.id').onDelete('cascade'))
    .addColumn('storage_key', 'text', (col) => col.notNull())
    .addColumn('variants', 'jsonb', (col) => col.notNull())
    .addColumn('width', 'integer', (col) => col.notNull())
    .addColumn('height', 'integer', (col) => col.notNull())
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('alt_text', 'text')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createIndex('product_images_product_id_idx').on('product_images').column('product_id').execute();
}
