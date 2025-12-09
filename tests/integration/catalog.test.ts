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

    it('hides products from suspended sellers', async () => {
      const suspended = await createSeller({ status: 'suspended' });
      await createProduct(suspended.seller.id, shoes.id);
      const res = await api().get('/api/products');
      expect(res.body.items).toHaveLength(0);
    });

    it('searches names and descriptions case-insensitively', async () => {
      const a = await createProduct(seller.seller.id, shoes.id, { name: 'Leather Sandal' });
      const b = await createProduct(seller.seller.id, kitchen.id, { name: 'Clay pot', description: 'Pairs well with a sandal-wood spoon' });
      await createProduct(seller.seller.id, kitchen.id, { name: 'Teapot' });

      const res = await api().get('/api/products').query({ q: 'SANDAL' });
      expect(res.body.items.map((p: { id: number }) => p.id).sort()).toEqual([a.id, b.id].sort());
      expect(res.body.meta.total).toBe(2);
    });

    it('filters by category including subcategories', async () => {
      const boot = await createProduct(seller.seller.id, shoes.id);
      const scarf = await createProduct(seller.seller.id, fashion.id);
      await createProduct(seller.seller.id, kitchen.id);

      const res = await api().get('/api/products').query({ category: 'fashion' });
      expect(res.body.items.map((p: { id: number }) => p.id).sort()).toEqual([boot.id, scarf.id].sort());

      const none = await api().get('/api/products').query({ category: 'does-not-exist' });
      expect(none.body.items).toEqual([]);
      expect(none.body.meta.total).toBe(0);
    });

    it('filters by seller, price, rating and stock', async () => {
      const other = await createSeller();
      const cheap = await createProduct(seller.seller.id, shoes.id, { priceCents: 500, ratingAvg: 4.5, ratingCount: 3 });
      const mid = await createProduct(seller.seller.id, shoes.id, { priceCents: 2500, ratingAvg: 3.9, ratingCount: 9, stock: 0 });
      await createProduct(seller.seller.id, shoes.id, { priceCents: 9900, ratingAvg: 5, ratingCount: 1 });
      await createProduct(other.seller.id, shoes.id, { priceCents: 700 });

      const bySeller = await api().get('/api/products').query({ seller: seller.seller.slug });
      expect(bySeller.body.meta.total).toBe(3);

      const byPrice = await api().get('/api/products').query({ seller: seller.seller.slug, minPrice: 400, maxPrice: 3000 });
      expect(byPrice.body.items.map((p: { id: number }) => p.id).sort()).toEqual([cheap.id, mid.id].sort());

      const byRating = await api().get('/api/products').query({ minRating: 4.5 });
      expect(byRating.body.meta.total).toBe(2);

      const inStock = await api().get('/api/products').query({ seller: seller.seller.slug, maxPrice: 3000, inStock: 'true' });
      expect(inStock.body.items.map((p: { id: number }) => p.id)).toEqual([cheap.id]);
    });

    it('sorts by price, rating and popularity', async () => {
      const a = await createProduct(seller.seller.id, shoes.id, { priceCents: 300, ratingAvg: 3, salesCount: 50 });
      const b = await createProduct(seller.seller.id, shoes.id, { priceCents: 100, ratingAvg: 5, salesCount: 5 });
      const c = await createProduct(seller.seller.id, shoes.id, { priceCents: 200, ratingAvg: 4, salesCount: 500 });
      const ids = async (sort: string) =>
        (await api().get('/api/products').query({ sort })).body.items.map((p: { id: number }) => p.id);

      expect(await ids('price_asc')).toEqual([b.id, c.id, a.id]);
      expect(await ids('price_desc')).toEqual([a.id, c.id, b.id]);
      expect(await ids('rating')).toEqual([b.id, c.id, a.id]);
      expect(await ids('popular')).toEqual([c.id, a.id, b.id]);
    });

    it('paginates', async () => {
      for (let i = 0; i < 5; i++) await createProduct(seller.seller.id, shoes.id);
      const page1 = await api().get('/api/products').query({ pageSize: 2, page: 1 });
      const page3 = await api().get('/api/products').query({ pageSize: 2, page: 3 });
      expect(page1.body.meta).toEqual({ page: 1, pageSize: 2, total: 5, totalPages: 3 });
      expect(page1.body.items).toHaveLength(2);
      expect(page3.body.items).toHaveLength(1);

      const tooBig = await api().get('/api/products').query({ pageSize: 500 });
      expect(tooBig.status).toBe(400);
    });

    it('returns category facets for the current filters', async () => {
      await createProduct(seller.seller.id, shoes.id, { name: 'Red shoe' });
      await createProduct(seller.seller.id, shoes.id, { name: 'Red boot' });
      await createProduct(seller.seller.id, kitchen.id, { name: 'Red kettle' });
      await createProduct(seller.seller.id, kitchen.id, { name: 'Blue kettle' });

      const res = await api().get('/api/products').query({ q: 'red' });
      expect(res.body.facets.categories).toEqual([
        { id: shoes.id, name: 'Shoes', slug: 'shoes', count: 2 },
        { id: kitchen.id, name: 'Kitchen', slug: 'kitchen', count: 1 },
      ]);
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

    it('knows whether the signed-in user has wishlisted it', async () => {
      const cat = await createCategory();
      const { seller } = await createSeller();
      const product = await createProduct(seller.id, cat.id);
      const user = await createUser();
      await db.insertInto('wishlist_items').values({ user_id: user.id, product_id: product.id }).execute();

      const res = await api().get(`/api/products/${product.id}`).set(user.auth);
      expect(res.body.inWishlist).toBe(true);
    });
  });

  describe('home page', () => {
    it('builds trending, new arrivals, top rated and deals sections', async () => {
      const cat = await createCategory({ name: 'Electronics', slug: 'electronics' });
      const { seller } = await createSeller();
      const hot = await createProduct(seller.id, cat.id, { name: 'Hot', priceCents: 1000 });
      const warm = await createProduct(seller.id, cat.id, { name: 'Warm', priceCents: 1000 });
      const stale = await createProduct(seller.id, cat.id, { name: 'Stale', priceCents: 1000 });
      const rated = await createProduct(seller.id, cat.id, { ratingAvg: 4.9, ratingCount: 20 });
      const deal = await createProduct(seller.id, cat.id, { priceCents: 500, compareAtCents: 1000 });
      const buyer = await createUser();
      await createOrder(buyer.id, [{ product: hot, quantity: 5 }, { product: warm, quantity: 2 }]);
      await createOrder(buyer.id, [{ product: stale, quantity: 50 }], { createdAt: new Date(Date.now() - 30 * 86_400_000) });

      const res = await api().get('/api/home');
      expect(res.status).toBe(200);
      expectSchema(HomeResponse, res.body);
      expect(res.body.categories.map((c: { slug: string }) => c.slug)).toEqual(['electronics']);
      expect(res.body.trending.map((p: { id: number }) => p.id)).toEqual([hot.id, warm.id]);
      expect(res.body.newArrivals.length).toBe(5);
      expect(res.body.topRated.map((p: { id: number }) => p.id)).toEqual([rated.id]);
      expect(res.body.deals.map((p: { id: number }) => p.id)).toEqual([deal.id]);
    });
  });
});
