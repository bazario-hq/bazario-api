import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { sentMail } from '../../src/lib/mailer.js';
import { ensureBucket } from '../../src/lib/storage.js';
import {
  DashboardSchema,
  PayoutsSchema,
  SellerOrderDetail,
  SellerProductList,
  SellerProductSchema,
} from '../../src/modules/seller/seller.schemas.js';
import { api, useTestDb } from '../support/app.js';
import { createCategory, createOrder, createProduct, createSeller, createUser } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

const DAY = 86_400_000;

describe('seller area', () => {
  useTestDb();

  let seller: Awaited<ReturnType<typeof createSeller>>;
  let categoryId: number;

  beforeAll(async () => {
    await ensureBucket();
  });

  beforeEach(async () => {
    seller = await createSeller({ storeName: 'Ruhunu Rugs' });
    categoryId = (await createCategory()).id;
  });

  describe('access', () => {
    it('updates the seller profile', async () => {
      const res = await api()
        .patch('/api/seller/profile')
        .set(seller.user.auth)
        .send({ storeName: 'Ruhunu Rugs & Mats', supportEmail: 'help@rugs.example.test' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ storeName: 'Ruhunu Rugs & Mats', supportEmail: 'help@rugs.example.test' });
    });
  });

  describe('products', () => {
    it('creates, reads, updates and archives products', async () => {
      const created = await api()
        .post('/api/seller/products')
        .set(seller.user.auth)
        .send({ name: 'Handwoven rug', description: 'Cotton', priceCents: 12000, categoryId, stock: 4, specs: { size: '2x3m' } });
      expect(created.status).toBe(201);
      expectSchema(SellerProductSchema, created.body);
      expect(created.body).toMatchObject({ status: 'draft', stock: 4, specs: { size: '2x3m' } });
      expect(created.body.slug).toMatch(/^handwoven-rug-/);
      const id = created.body.id;

      const published = await api().patch(`/api/seller/products/${id}`).set(seller.user.auth).send({ status: 'active' });
      expect(published.body.status).toBe('active');
      const row = await db.selectFrom('products').select('published_at').where('id', '=', id).executeTakeFirstOrThrow();
      expect(row.published_at).not.toBeNull();
      expect((await api().get(`/api/products/${id}`)).status).toBe(200);

      const list = await api().get('/api/seller/products').set(seller.user.auth);
      expectSchema(SellerProductList, list.body);
      expect(list.body.items.map((p: { id: number }) => p.id)).toEqual([id]);

      expect((await api().delete(`/api/seller/products/${id}`).set(seller.user.auth)).status).toBe(204);
      expect((await api().get('/api/seller/products').set(seller.user.auth)).body.items).toEqual([]);
      expect((await api().get('/api/seller/products').query({ status: 'archived' }).set(seller.user.auth)).body.items).toHaveLength(1);

      const audit = await db.selectFrom('audit_log').select('action').orderBy('id').execute();
      expect(audit.map((a) => a.action)).toEqual(['product.create', 'product.update', 'product.archive']);
    });

    it("cannot see or edit another seller's products", async () => {
      const other = await createSeller();
      const theirs = await createProduct(other.seller.id, categoryId);
      expect((await api().get(`/api/seller/products/${theirs.id}`).set(seller.user.auth)).status).toBe(404);
      expect((await api().patch(`/api/seller/products/${theirs.id}`).set(seller.user.auth).send({ priceCents: 1 })).status).toBe(404);
    });

    it('rejects unknown categories', async () => {
      const res = await api()
        .post('/api/seller/products')
        .set(seller.user.auth)
        .send({ name: 'Thing', priceCents: 100, categoryId: 999999 });
      expect(res.status).toBe(400);
    });

    it('tells wishlisters about a price drop', async () => {
      const product = await createProduct(seller.seller.id, categoryId, { priceCents: 5000, name: 'Mat' });
      const fans = [await createUser(), await createUser()];
      for (const fan of fans) {
        await db.insertInto('wishlist_items').values({ user_id: fan.id, product_id: product.id }).execute();
      }

      await api().patch(`/api/seller/products/${product.id}`).set(seller.user.auth).send({ priceCents: 5500 });
      expect(await db.selectFrom('notifications').selectAll().execute()).toHaveLength(0);

      await api().patch(`/api/seller/products/${product.id}`).set(seller.user.auth).send({ priceCents: 4000 });
      const notes = await db.selectFrom('notifications').select(['user_id', 'body']).execute();
      expect(notes.map((n) => n.user_id).sort()).toEqual(fans.map((f) => f.id).sort());
      expect(notes[0].body).toBe('Mat is now $40.00 (was $55.00)');
    });

    it('uploads images, stores resized variants and serves them', async () => {
      const product = await createProduct(seller.seller.id, categoryId);
      const jpeg = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#c0392b' } }).jpeg().toBuffer();

      const res = await api()
        .post(`/api/seller/products/${product.id}/images`)
        .set(seller.user.auth)
        .field('altText', 'Red rug')
        .attach('image', jpeg, { filename: 'rug.jpg', contentType: 'image/jpeg' });
      expect(res.status).toBe(201);
      expect(res.body.images).toHaveLength(1);
      const image = res.body.images[0];
      expect(image).toMatchObject({ width: 1600, height: 1200, altText: 'Red rug', position: 0 });

      const thumbPath = new URL(image.thumbUrl).pathname;
      const thumb = await api().get(thumbPath).buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      expect(thumb.status).toBe(200);
      expect(thumb.headers['content-type']).toBe('image/jpeg');
      const meta = await sharp(thumb.body as Buffer).metadata();
      expect(meta.width).toBe(200);

      const second = await api()
        .post(`/api/seller/products/${product.id}/images`)
        .set(seller.user.auth)
        .attach('image', jpeg, { filename: 'rug2.jpg', contentType: 'image/jpeg' });
      expect(second.body.images.map((i: { position: number }) => i.position)).toEqual([0, 1]);

      expect((await api().delete(`/api/seller/products/${product.id}/images/${image.id}`).set(seller.user.auth)).status).toBe(204);
      expect((await api().get(thumbPath)).status).toBe(404);
    });

    it('rejects non-image uploads', async () => {
      const product = await createProduct(seller.seller.id, categoryId);
      const res = await api()
        .post(`/api/seller/products/${product.id}/images`)
        .set(seller.user.auth)
        .attach('image', Buffer.from('hello'), { filename: 'notes.txt', contentType: 'text/plain' });
      expect(res.status).toBe(400);
    });
  });

  describe('inventory', () => {
  });

  describe('orders', () => {
    it('lists orders with the seller items and ships them', async () => {
      const mine = await createProduct(seller.seller.id, categoryId, { name: 'Rug', priceCents: 3000 });
      const other = await createSeller();
      const theirs = await createProduct(other.seller.id, categoryId, { name: 'Lamp' });
      const buyer = await createUser({ name: 'Kamal' });
      const order = await createOrder(buyer.id, [{ product: mine, quantity: 2 }, { product: theirs, quantity: 1 }]);

      const list = await api().get('/api/seller/orders').set(seller.user.auth);
      expect(list.body.items).toEqual([
        expect.objectContaining({ orderId: order.id, buyerName: 'Kamal', itemCount: 2, totalCents: 6000, fulfilment: 'pending' }),
      ]);

      const detail = await api().get(`/api/seller/orders/${order.id}`).set(seller.user.auth);
      expectSchema(SellerOrderDetail, detail.body);
      expect(detail.body.items.map((i: { productName: string }) => i.productName)).toEqual(['Rug']);

      const shipped = await api()
        .post(`/api/seller/orders/${order.id}/ship`)
        .set(seller.user.auth)
        .send({ trackingNumber: 'LK123456789' });
      expect(shipped.status).toBe(200);
      expect(shipped.body.items[0]).toMatchObject({ status: 'shipped', trackingNumber: 'LK123456789' });

      const buyerView = await api().get(`/api/orders/${order.id}`).set(buyer.auth);
      expect(buyerView.body.status).toBe('partially_shipped');
      expect(sentMail.some((m) => m.to === buyer.email && m.subject.includes('has shipped'))).toBe(true);
      const note = await db.selectFrom('notifications').select('type').where('user_id', '=', buyer.id).execute();
      expect(note.map((n) => n.type)).toEqual(['order.shipped']);

      expect((await api().post(`/api/seller/orders/${order.id}/ship`).set(seller.user.auth).send({ trackingNumber: 'AGAIN' })).status).toBe(409);

      const delivered = await api().post(`/api/seller/orders/${order.id}/deliver`).set(seller.user.auth).send({});
      expect(delivered.body.items[0].status).toBe('delivered');

      const filtered = await api().get('/api/seller/orders').query({ status: 'pending' }).set(seller.user.auth);
      expect(filtered.body.items).toEqual([]);
    });

    it('404s for orders without the seller items', async () => {
      const other = await createSeller();
      const theirs = await createProduct(other.seller.id, categoryId);
      const buyer = await createUser();
      const order = await createOrder(buyer.id, [{ product: theirs, quantity: 1 }]);
      expect((await api().get(`/api/seller/orders/${order.id}`).set(seller.user.auth)).status).toBe(404);
    });
  });

  describe('dashboard', () => {
    it('summarises revenue, orders, customers and trends', async () => {
      const rug = await createProduct(seller.seller.id, categoryId, { name: 'Rug', priceCents: 1000 });
      const mat = await createProduct(seller.seller.id, categoryId, { name: 'Mat', priceCents: 500, stock: 1 });
      const b1 = await createUser();
      const b2 = await createUser();
      const now = Date.now();

      await createOrder(b1.id, [{ product: rug, quantity: 2 }], { createdAt: new Date(now - 1 * DAY) });
      await createOrder(b2.id, [{ product: rug, quantity: 1 }, { product: mat, quantity: 4 }], { createdAt: new Date(now - 2 * DAY) });
      await createOrder(b2.id, [{ product: rug, quantity: 9, status: 'cancelled' }], { createdAt: new Date(now - 2 * DAY) });
      await createOrder(b1.id, [{ product: mat, quantity: 1 }], { createdAt: new Date(now - 10 * DAY) });

      const res = await api().get('/api/seller/dashboard').query({ range: '7d' }).set(seller.user.auth);
      expect(res.status).toBe(200);
      expectSchema(DashboardSchema, res.body);
      expect(res.body.kpis).toEqual({ revenueCents: 5000, orders: 2, units: 7, averageOrderCents: 2500, customers: 2 });
      expect(res.body.previous).toEqual({ revenueCents: 500, orders: 1, units: 1, averageOrderCents: 500, customers: 1 });
      expect(res.body.salesByDay).toHaveLength(7);
      expect(res.body.salesByDay.reduce((s: number, d: { revenueCents: number }) => s + d.revenueCents, 0)).toBe(5000);
      expect(res.body.topProducts.map((p: { name: string }) => p.name)).toEqual(['Rug', 'Mat']);
      expect(res.body.lowStock).toEqual({ count: 1, items: [{ productId: mat.id, name: 'Mat', stock: 1 }] });
      expect(res.body.pendingShipments).toBe(3);
    });
  });

  describe('payouts and exports', () => {
    it('summarises shipped sales by month with platform fees', async () => {
      const rug = await createProduct(seller.seller.id, categoryId, { priceCents: 10000 });
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product: rug, quantity: 1, status: 'delivered' }]);
      await createOrder(buyer.id, [{ product: rug, quantity: 1, status: 'shipped' }]);
      await createOrder(buyer.id, [{ product: rug, quantity: 1, status: 'pending' }]);

      const res = await api().get('/api/seller/payouts').set(seller.user.auth);
      expect(res.status).toBe(200);
      expectSchema(PayoutsSchema, res.body);
      expect(res.body.months).toHaveLength(12);
      expect(res.body.months[0]).toMatchObject({ grossCents: 20000, feeCents: 2000, netCents: 18000, status: 'open' });
      expect(res.body.months[1].status).toBe('scheduled');
      expect(res.body.totals).toEqual({ grossCents: 20000, feeCents: 2000, netCents: 18000 });
    });
  });
});
