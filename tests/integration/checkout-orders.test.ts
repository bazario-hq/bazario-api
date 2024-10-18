import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { sentMail } from '../../src/lib/mailer.js';
import { OrderList, OrderSchema } from '../../src/modules/orders/orders.schemas.js';
import { api, useTestDb } from '../support/app.js';
import { address, addImage, createCategory, createOrder, createProduct, createSeller, createUser } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

const goodCard = { cardNumber: '4242 4242 4242 4242', expMonth: 12, expYear: 2099, cvc: '123' };

describe('checkout and orders', () => {
  useTestDb();

  let buyer: Awaited<ReturnType<typeof createUser>>;
  let sellerA: Awaited<ReturnType<typeof createSeller>>;
  let sellerB: Awaited<ReturnType<typeof createSeller>>;
  let lamp: Awaited<ReturnType<typeof createProduct>>;
  let mug: Awaited<ReturnType<typeof createProduct>>;

  beforeEach(async () => {
    const cat = await createCategory();
    sellerA = await createSeller({ storeName: 'Lamps & Co' });
    sellerB = await createSeller({ storeName: 'Mug House' });
    lamp = await createProduct(sellerA.seller.id, cat.id, { name: 'Lamp', priceCents: 2000, stock: 5 });
    mug = await createProduct(sellerB.seller.id, cat.id, { name: 'Mug', priceCents: 1000, stock: 10 });
    buyer = await createUser({ name: 'Ada' });
  });

  async function fillCart() {
    await api().put(`/api/cart/items/${lamp.id}`).set(buyer.auth).send({ quantity: 2 });
    await api().put(`/api/cart/items/${mug.id}`).set(buyer.auth).send({ quantity: 1 });
  }

  async function quote() {
    const res = await api().post('/api/checkout/quote').set(buyer.auth).send({ shippingAddress: address });
    expect(res.status).toBe(201);
    return res.body;
  }

  const stockOf = async (id: number) =>
    (await db.selectFrom('products').select(['stock', 'sales_count']).where('id', '=', id).executeTakeFirstOrThrow());

  it('quotes the cart', async () => {
    await fillCart();
    const q = await quote();
    expect(q).toMatchObject({ subtotalCents: 5000, shippingCents: 0, totalCents: 5000, currency: 'USD' });
    expect(q.items).toHaveLength(2);
  });

  it('places an order: charges, decrements stock, empties the cart and notifies everyone', async () => {
    await fillCart();
    const q = await quote();
    const res = await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard });

    expect(res.status).toBe(201);
    expectSchema(OrderSchema, res.body);
    expect(res.body).toMatchObject({ status: 'paid', totalCents: 5000, paymentLast4: '4242' });
    expect(res.body.items.map((i: { productName: string; status: string }) => [i.productName, i.status])).toEqual([
      ['Lamp', 'pending'],
      ['Mug', 'pending'],
    ]);

    expect(await stockOf(lamp.id)).toEqual({ stock: 3, sales_count: 2 });
    expect(await stockOf(mug.id)).toEqual({ stock: 9, sales_count: 1 });
    expect((await api().get('/api/cart').set(buyer.auth)).body.items).toEqual([]);

    const adjustments = await db.selectFrom('inventory_adjustments').select(['product_id', 'delta']).execute();
    expect(adjustments).toEqual(expect.arrayContaining([{ product_id: lamp.id, delta: -2 }, { product_id: mug.id, delta: -1 }]));

    expect(sentMail.map((m) => m.subject)).toEqual([
      `Your Bazario order #${res.body.id}`,
      `New order #${res.body.id} for Lamps & Co`,
      `New order #${res.body.id} for Mug House`,
    ]);
    const notified = await db.selectFrom('notifications').select('user_id').where('type', '=', 'order.created').execute();
    expect(notified.map((n) => n.user_id).sort()).toEqual([sellerA.user.id, sellerB.user.id].sort());
  });

  it('asks the buyer to review the cart when a price changed after quoting', async () => {
    await fillCart();
    const q = await quote();
    await db.updateTable('products').set({ price_cents: 2500 }).where('id', '=', lamp.id).execute();
    const res = await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard });
    expect(res.status).toBe(409);
  });

  it('rejects unknown quotes and quotes belonging to someone else', async () => {
    await fillCart();
    const q = await quote();
    const other = await createUser();
    const stolen = await api().post('/api/checkout/confirm').set(other.auth).send({ quoteId: q.quoteId, payment: goodCard });
    expect(stolen.status).toBe(410);
    const unknown = await api()
      .post('/api/checkout/confirm')
      .set(buyer.auth)
      .send({ quoteId: '00000000-0000-4000-8000-000000000000', payment: goodCard });
    expect(unknown.status).toBe(410);
  });
});
