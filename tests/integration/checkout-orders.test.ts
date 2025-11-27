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

  it('refuses to quote an empty cart', async () => {
    const res = await api().post('/api/checkout/quote').set(buyer.auth).send({ shippingAddress: address });
    expect(res.status).toBe(422);
  });

  it('refuses to quote when an item is out of stock', async () => {
    await fillCart();
    await db.updateTable('products').set({ stock: 1 }).where('id', '=', lamp.id).execute();
    const res = await api().post('/api/checkout/quote').set(buyer.auth).send({ shippingAddress: address });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toEqual([{ productId: lamp.id, name: 'Lamp', available: 1 }]);
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

  it('does not place the order when the card is declined', async () => {
    await fillCart();
    const q = await quote();
    const res = await api()
      .post('/api/checkout/confirm')
      .set(buyer.auth)
      .send({ quoteId: q.quoteId, payment: { ...goodCard, cardNumber: '4000 0000 0000 0002' } });
    expect(res.status).toBe(402);
    expect(await stockOf(lamp.id)).toEqual({ stock: 5, sales_count: 0 });
    expect(await db.selectFrom('orders').selectAll().execute()).toHaveLength(0);
    expect((await api().get('/api/cart').set(buyer.auth)).body.items).toHaveLength(2);
  });

  it('asks the buyer to review the cart when a price changed after quoting', async () => {
    await fillCart();
    const q = await quote();
    await db.updateTable('products').set({ price_cents: 2500 }).where('id', '=', lamp.id).execute();
    const res = await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard });
    expect(res.status).toBe(409);
  });

  it('fails cleanly when stock ran out after quoting', async () => {
    await fillCart();
    const q = await quote();
    await db.updateTable('products').set({ stock: 1 }).where('id', '=', lamp.id).execute();
    const res = await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toBe('Only 1 left of Lamp');
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

  it('cannot confirm the same quote twice', async () => {
    await fillCart();
    const q = await quote();
    expect((await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard })).status).toBe(201);
    expect((await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard })).status).toBe(410);
  });

  describe('order history', () => {
    it('lists the buyer orders newest first with items and images', async () => {
      await addImage(lamp.id);
      const first = await createOrder(buyer.id, [{ product: lamp, quantity: 1 }], { createdAt: new Date('2026-01-01') });
      const second = await createOrder(buyer.id, [{ product: mug, quantity: 2 }, { product: lamp, quantity: 1 }], {
        createdAt: new Date('2026-02-01'),
      });
      const someoneElse = await createUser();
      await createOrder(someoneElse.id, [{ product: mug, quantity: 1 }]);

      const res = await api().get('/api/orders').set(buyer.auth);
      expect(res.status).toBe(200);
      expectSchema(OrderList, res.body);
      expect(res.body.items.map((o: { id: number }) => o.id)).toEqual([second.id, first.id]);
      expect(res.body.meta.total).toBe(2);
      expect(res.body.items[0].items).toHaveLength(2);
      expect(res.body.items[1].items[0].image).not.toBeNull();
      expect(res.body.items[0].items[0].seller.storeName).toBe('Mug House');

      const page2 = await api().get('/api/orders').query({ page: 2, pageSize: 1 }).set(buyer.auth);
      expect(page2.body.items.map((o: { id: number }) => o.id)).toEqual([first.id]);
    });

    it('shows a single order only to its buyer', async () => {
      const order = await createOrder(buyer.id, [{ product: lamp, quantity: 1 }]);
      const other = await createUser();
      expect((await api().get(`/api/orders/${order.id}`).set(buyer.auth)).status).toBe(200);
      expect((await api().get(`/api/orders/${order.id}`).set(other.auth)).status).toBe(404);
    });
  });

  describe('cancellation', () => {
    it('cancels an unshipped order, restores stock and tells the sellers', async () => {
      await fillCart();
      const q = await quote();
      const placed = await api().post('/api/checkout/confirm').set(buyer.auth).send({ quoteId: q.quoteId, payment: goodCard });

      const res = await api().post(`/api/orders/${placed.body.id}/cancel`).set(buyer.auth);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      expect(res.body.items.every((i: { status: string }) => i.status === 'cancelled')).toBe(true);
      expect(await stockOf(lamp.id)).toEqual({ stock: 5, sales_count: 0 });

      const notes = await db.selectFrom('notifications').select('user_id').where('type', '=', 'order.cancelled').execute();
      expect(notes).toHaveLength(2);
      expect((await api().post(`/api/orders/${placed.body.id}/cancel`).set(buyer.auth)).status).toBe(409);
    });

    it('cannot cancel once something has shipped', async () => {
      const order = await createOrder(buyer.id, [
        { product: lamp, quantity: 1, status: 'shipped' },
        { product: mug, quantity: 1 },
      ]);
      const res = await api().post(`/api/orders/${order.id}/cancel`).set(buyer.auth);
      expect(res.status).toBe(409);
    });
  });
});
