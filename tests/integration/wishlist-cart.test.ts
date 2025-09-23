import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db/index.js';
import { CartSchema } from '../../src/modules/cart/cart.routes.js';
import { api, useTestDb } from '../support/app.js';
import { addImage, createCategory, createProduct, createSeller, createUser } from '../support/factories.js';
import { expectSchema } from '../support/schema.js';

describe('wishlist and cart', () => {
  useTestDb();

  let buyer: Awaited<ReturnType<typeof createUser>>;
  let product: Awaited<ReturnType<typeof createProduct>>;
  let sellerId: number;
  let categoryId: number;

  beforeEach(async () => {
    const cat = await createCategory();
    const { seller } = await createSeller();
    sellerId = seller.id;
    categoryId = cat.id;
    product = await createProduct(seller.id, cat.id, { priceCents: 1500, stock: 3 });
    buyer = await createUser();
  });

  describe('wishlist', () => {
    it('adds, lists and removes products idempotently', async () => {
      await addImage(product.id);
      expect((await api().put(`/api/wishlist/${product.id}`).set(buyer.auth)).status).toBe(204);
      expect((await api().put(`/api/wishlist/${product.id}`).set(buyer.auth)).status).toBe(204);

      const list = await api().get('/api/wishlist').set(buyer.auth);
      expect(list.status).toBe(200);
      expect(list.body.items).toHaveLength(1);
      expect(list.body.items[0].product.id).toBe(product.id);
      expect(list.body.items[0].product.image).not.toBeNull();

      expect((await api().delete(`/api/wishlist/${product.id}`).set(buyer.auth)).status).toBe(204);
      expect((await api().get('/api/wishlist').set(buyer.auth)).body.items).toHaveLength(0);
    });

    it('rejects unknown or inactive products', async () => {
      const draft = await createProduct(sellerId, categoryId, { status: 'draft' });
      expect((await api().put(`/api/wishlist/${draft.id}`).set(buyer.auth)).status).toBe(404);
      expect((await api().put('/api/wishlist/424242').set(buyer.auth)).status).toBe(404);
    });
  });

  describe('cart', () => {
    it('adds items and computes totals with flat shipping under the threshold', async () => {
      const res = await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 2 });
      expect(res.status).toBe(200);
      expectSchema(CartSchema, res.body);
      expect(res.body).toMatchObject({ subtotalCents: 3000, shippingCents: 599, totalCents: 3599, itemCount: 2 });
      expect(res.body.items[0]).toMatchObject({ productId: product.id, quantity: 2, lineTotalCents: 3000, available: true });
    });

    it('ships free over the threshold', async () => {
      const pricey = await createProduct(sellerId, categoryId, { priceCents: 6000 });
      const res = await api().put(`/api/cart/items/${pricey.id}`).set(buyer.auth).send({ quantity: 1 });
      expect(res.body).toMatchObject({ subtotalCents: 6000, shippingCents: 0, totalCents: 6000 });
    });

    it('sets the quantity rather than adding to it', async () => {
      await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 1 });
      const res = await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 3 });
      expect(res.body.items[0].quantity).toBe(3);
    });

    it('refuses more than the available stock', async () => {
      const res = await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 4 });
      expect(res.status).toBe(422);
      expect(res.body.error.details).toEqual({ available: 3 });
    });

    it('flags items that became unavailable and leaves them out of the total', async () => {
      await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 2 });
      await db.updateTable('products').set({ stock: 1 }).where('id', '=', product.id).execute();
      const res = await api().get('/api/cart').set(buyer.auth);
      expect(res.body.items[0].available).toBe(false);
      expect(res.body.subtotalCents).toBe(0);
    });

    it('removes items and clears the cart', async () => {
      const other = await createProduct(sellerId, categoryId);
      await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 1 });
      await api().put(`/api/cart/items/${other.id}`).set(buyer.auth).send({ quantity: 1 });

      const removed = await api().delete(`/api/cart/items/${product.id}`).set(buyer.auth);
      expect(removed.body.items.map((i: { productId: number }) => i.productId)).toEqual([other.id]);

      expect((await api().delete('/api/cart').set(buyer.auth)).status).toBe(204);
      expect((await api().get('/api/cart').set(buyer.auth)).body.items).toEqual([]);
    });

    it('keeps carts separate per user', async () => {
      const other = await createUser();
      await api().put(`/api/cart/items/${product.id}`).set(buyer.auth).send({ quantity: 1 });
      expect((await api().get('/api/cart').set(other.auth)).body.items).toEqual([]);
    });
  });
});
