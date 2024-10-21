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
  });

  describe('payouts and exports', () => {
  });
});
