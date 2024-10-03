import { Router } from 'express';
import { db } from '../../db/index.js';
import { notFound } from '../../lib/errors.js';
import { route } from '../../lib/route.js';
import { z } from '../../openapi/zod.js';
import { ProductCard } from '../catalog/catalog.schemas.js';
import { toProductCards } from '../catalog/product-card.js';

// Predates the routes/services/repositories split (BZR-198); move into a
// service when this module next needs real changes.
export const wishlistRouter = Router();
const mount = '/wishlist';
const tags = ['Wishlist'];
const ProductIdParams = z.object({ productId: z.coerce.number().int().positive() });

route(
  wishlistRouter,
  mount,
  {
    method: 'get',
    path: '',
    summary: 'Your wishlist',
    tags,
    auth: 'required',
    responses: {
      200: {
        description: 'Wishlist',
        schema: z.object({ items: z.array(z.object({ addedAt: z.string(), product: ProductCard })) }),
      },
    },
  },
  async ({ user }) => {
    const rows = await db
      .selectFrom('wishlist_items')
      .innerJoin('products', 'products.id', 'wishlist_items.product_id')
      .innerJoin('sellers', 'sellers.id', 'products.seller_id')
      .selectAll('products')
      .select([
        'sellers.store_name as seller_store_name',
        'sellers.slug as seller_slug',
        'wishlist_items.created_at as added_at',
      ])
      .where('wishlist_items.user_id', '=', user.id)
      .where('products.status', '!=', 'archived')
      .orderBy('wishlist_items.created_at', 'desc')
      .execute();
    const cards = await toProductCards(rows);
    return { items: rows.map((r, i) => ({ addedAt: r.added_at.toISOString(), product: cards[i] })) };
  },
);

route(
  wishlistRouter,
  mount,
  {
    method: 'put',
    path: '/{productId}',
    summary: 'Add a product to your wishlist',
    tags,
    auth: 'required',
    params: ProductIdParams,
    responses: { 204: { description: 'Added' }, 404: { description: 'Product not found' } },
  },
  async ({ user, params }) => {
    const product = await db
      .selectFrom('products')
      .select('id')
      .where('id', '=', params.productId)
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!product) throw notFound('Product');
    await db
      .insertInto('wishlist_items')
      .values({ user_id: user.id, product_id: params.productId })
      .onConflict((oc) => oc.doNothing())
      .execute();
  },
);

route(
  wishlistRouter,
  mount,
  {
    method: 'delete',
    path: '/{productId}',
    summary: 'Remove a product from your wishlist',
    tags,
    auth: 'required',
    params: ProductIdParams,
    responses: { 204: { description: 'Removed' } },
  },
  async ({ user, params }) => {
    await db
      .deleteFrom('wishlist_items')
      .where('user_id', '=', user.id)
      .where('product_id', '=', params.productId)
      .execute();
  },
);
