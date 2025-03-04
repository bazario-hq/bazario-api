import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('payouts')
    .addColumn('id', 'bigint', (col) => col.primaryKey().generatedAlwaysAsIdentity())
    .addColumn('seller_id', 'bigint', (col) => col.notNull().references('sellers.id'))
    .addColumn('period_month', 'date', (col) => col.notNull())
    .addColumn('gross_cents', 'bigint', (col) => col.notNull())
    .addColumn('fee_cents', 'bigint', (col) => col.notNull())
    .addColumn('net_cents', 'bigint', (col) => col.notNull())
    .addColumn('status', 'text', (col) => col.notNull().defaultTo('scheduled'))
    .addColumn('paid_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint('payouts_seller_period_key', ['seller_id', 'period_month'])
    .execute();
}
