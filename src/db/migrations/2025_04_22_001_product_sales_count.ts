import { Kysely, sql } from 'kysely';

// Popularity sort used to aggregate order_items on every request.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('products')
    .addColumn('sales_count', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('published_at', 'timestamptz')
    .execute();

  await sql`
    update products p
    set sales_count = coalesce(s.units, 0)
    from (select product_id, sum(quantity)::int as units from order_items group by product_id) s
    where s.product_id = p.id
  `.execute(db);

  await sql`update products set published_at = created_at where status = 'active'`.execute(db);
}
