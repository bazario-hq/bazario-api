import { db } from '../../db/index.js';

export const ordersRepository = {
  listForBuyer(buyerId: number, limit: number, offset: number) {
    return db
      .selectFrom('orders')
      .selectAll()
      .where('buyer_id', '=', buyerId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
  },

  async countForBuyer(buyerId: number) {
    const row = await db
      .selectFrom('orders')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('buyer_id', '=', buyerId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  },

  findById(id: number) {
    return db.selectFrom('orders').selectAll().where('id', '=', id).executeTakeFirst();
  },

  items(orderId: number) {
    return db
      .selectFrom('order_items')
      .innerJoin('sellers', 'sellers.id', 'order_items.seller_id')
      .selectAll('order_items')
      .select(['sellers.store_name as seller_store_name', 'sellers.slug as seller_slug'])
      .where('order_items.order_id', '=', orderId)
      .orderBy('order_items.id')
      .execute();
  },
};

export type OrderRow = NonNullable<Awaited<ReturnType<typeof ordersRepository.findById>>>;
export type OrderItemRow = Awaited<ReturnType<typeof ordersRepository.items>>[number];
