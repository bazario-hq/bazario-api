import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    create table orders (
      id bigint generated always as identity primary key,
      buyer_id bigint not null references users(id),
      status text not null default 'paid',
      subtotal_cents integer not null,
      shipping_cents integer not null default 0,
      total_cents integer not null,
      currency text not null default 'USD',
      shipping_address jsonb not null,
      payment_ref text not null,
      payment_last4 text not null,
      cancelled_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`
    create table order_items (
      id bigint generated always as identity primary key,
      order_id bigint not null references orders(id) on delete cascade,
      product_id bigint not null references products(id),
      seller_id bigint not null references sellers(id),
      product_name text not null,
      unit_price_cents integer not null,
      quantity integer not null check (quantity > 0),
      status text not null default 'pending',
      tracking_number text,
      shipped_at timestamptz,
      delivered_at timestamptz,
      created_at timestamptz not null default now()
    )
  `.execute(db);

  await sql`create index order_items_order_id_idx on order_items (order_id)`.execute(db);
  await sql`create index order_items_seller_id_idx on order_items (seller_id)`.execute(db);
  await sql`create index orders_created_at_idx on orders (created_at)`.execute(db);
}
