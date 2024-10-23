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

  describe('payouts and exports', () => {
  });
});
