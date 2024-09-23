import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import {
  CategoryDetail,
  CategoryTree,
  HomeResponse,
  ProductDetail,
  ProductSearchResponse,
} from '../../src/modules/catalog/catalog.schemas.js';
import { api, useTestDb } from '../support/app.js';
import {
  addImage,
  createCategory,
  createOrder,
  createProduct,
  createReview,
  createSeller,
  createUser,
} from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

describe('catalog', () => {
  useTestDb();

  describe('categories', () => {
    it('returns the category tree', async () => {
      const fashion = await createCategory({ name: 'Fashion', slug: 'fashion' });
      const shoes = await createCategory({ name: 'Shoes', slug: 'shoes', parentId: fashion.id });
      await createCategory({ name: 'Sneakers', slug: 'sneakers', parentId: shoes.id });
      await createCategory({ name: 'Home', slug: 'home' });

      const res = await api().get('/api/categories');
      expect(res.status).toBe(200);
      expectSchema(CategoryTree, res.body);
      const names = res.body.categories.map((c: { name: string }) => c.name);
      expect(names).toEqual(['Fashion', 'Home']);
      expect(res.body.categories[0].children[0].children[0].slug).toBe('sneakers');
    });
  });

  describe('product search', () => {
    let fashion: Awaited<ReturnType<typeof createCategory>>;
    let shoes: Awaited<ReturnType<typeof createCategory>>;
    let kitchen: Awaited<ReturnType<typeof createCategory>>;
    let seller: Awaited<ReturnType<typeof createSeller>>;

    beforeEach(async () => {
      fashion = await createCategory({ name: 'Fashion', slug: 'fashion' });
      shoes = await createCategory({ name: 'Shoes', slug: 'shoes', parentId: fashion.id });
      kitchen = await createCategory({ name: 'Kitchen', slug: 'kitchen' });
      seller = await createSeller({ storeName: 'Kandy Crafts' });
    });

    it('lists active products only, newest first, with pagination metadata', async () => {
      const older = await createProduct(seller.seller.id, shoes.id, { name: 'Old boot', publishedAt: new Date('2025-01-01') });
      const newer = await createProduct(seller.seller.id, shoes.id, { name: 'New boot', publishedAt: new Date('2026-01-01') });
      await createProduct(seller.seller.id, shoes.id, { name: 'Draft boot', status: 'draft' });
      await createProduct(seller.seller.id, shoes.id, { name: 'Archived boot', status: 'archived' });
      await addImage(newer.id, 1);
      const primary = await addImage(newer.id, 0);

      const res = await api().get('/api/products');
      expect(res.status).toBe(200);
      expectSchema(ProductSearchResponse, res.body);
      expect(res.body.items.map((p: { id: number }) => p.id)).toEqual([newer.id, older.id]);
      expect(res.body.meta).toEqual({ page: 1, pageSize: 24, total: 2, totalPages: 1 });
      expect(res.body.items[0].image.id).toBe(primary.id);
      expect(res.body.items[0].image.thumbUrl).toMatch(/^http:\/\/api\.test\/images\/products\/.+\/thumb\.jpg$/);
      expect(res.body.items[1].image).toBeNull();
      expect(res.body.items[0].seller).toEqual({ id: seller.seller.id, storeName: 'Kandy Crafts', slug: seller.seller.slug });
    });

    it('searches names and descriptions case-insensitively', async () => {
      const a = await createProduct(seller.seller.id, shoes.id, { name: 'Leather Sandal' });
      const b = await createProduct(seller.seller.id, kitchen.id, { name: 'Clay pot', description: 'Pairs well with a sandal-wood spoon' });
      await createProduct(seller.seller.id, kitchen.id, { name: 'Teapot' });

      const res = await api().get('/api/products').query({ q: 'SANDAL' });
      expect(res.body.items.map((p: { id: number }) => p.id).sort()).toEqual([a.id, b.id].sort());
      expect(res.body.meta.total).toBe(2);
    });
  });

  describe('product detail', () => {
    it('returns the product with images, seller, breadcrumb, rating histogram and related products', async () => {
      const fashion = await createCategory({ name: 'Fashion', slug: 'fashion' });
      const shoes = await createCategory({ name: 'Shoes', slug: 'shoes', parentId: fashion.id });
      const { seller } = await createSeller({ storeName: 'Galle Leather' });
      const product = await createProduct(seller.id, shoes.id, { name: 'Boot', ratingAvg: 4.5, ratingCount: 2 });
      const related = await createProduct(seller.id, shoes.id, { salesCount: 10 });
      await createProduct(seller.id, shoes.id, { status: 'draft' });
      await addImage(product.id, 1);
      await addImage(product.id, 0);
      const r1 = await createUser();
      const r2 = await createUser();
      await createReview(product.id, r1.id, 5);
      await createReview(product.id, r2.id, 4);

      const res = await api().get(`/api/products/${product.id}`);
      expect(res.status).toBe(200);
      expectSchema(ProductDetail, res.body);
      expect(res.body.images.map((i: { position: number }) => i.position)).toEqual([0, 1]);
      expect(res.body.seller).toMatchObject({ id: seller.id, storeName: 'Galle Leather' });
      expect(res.body.breadcrumb.map((c: { slug: string }) => c.slug)).toEqual(['fashion', 'shoes']);
      expect(res.body.category.slug).toBe('shoes');
      expect(res.body.ratingHistogram).toEqual({ '5': 1, '4': 1, '3': 0, '2': 0, '1': 0 });
      expect(res.body.related.map((p: { id: number }) => p.id)).toEqual([related.id]);
      expect(res.body.inWishlist).toBe(false);
    });
  });
});
