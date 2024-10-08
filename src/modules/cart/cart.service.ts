import { db } from '../../db/index.js';
import type { ImageVariants } from '../../db/types.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { shippingFor } from '../../lib/money.js';
import { serializeImage } from '../common/serializers.js';
import { productImagesRepository } from '../catalog/images.repository.js';

export async function loadCartRows(userId: number) {
  return db
    .selectFrom('cart_items')
    .innerJoin('products', 'products.id', 'cart_items.product_id')
    .innerJoin('sellers', 'sellers.id', 'products.seller_id')
    .select([
      'cart_items.product_id',
      'cart_items.quantity',
      'products.name',
      'products.slug',
      'products.price_cents',
      'products.currency',
      'products.stock',
      'products.status',
      'products.seller_id',
      'sellers.store_name as seller_store_name',
      'sellers.slug as seller_slug',
      'sellers.status as seller_status',
    ])
    .where('cart_items.user_id', '=', userId)
    .orderBy('cart_items.created_at')
    .execute();
}

export const cartService = {
  async get(userId: number) {
    const rows = await loadCartRows(userId);
    const images = await productImagesRepository.primaryImages(rows.map((r) => r.product_id));

    const items = rows.map((r) => {
      const image = images.get(r.product_id);
      const available = r.status === 'active' && r.seller_status === 'active';
      return {
        productId: r.product_id,
        name: r.name,
        slug: r.slug,
        unitPriceCents: r.price_cents,
        quantity: r.quantity,
        lineTotalCents: r.price_cents * r.quantity,
        stock: r.stock,
        available: available && r.stock >= r.quantity,
        image: image ? serializeImage({ ...image, variants: image.variants as ImageVariants }) : null,
        seller: { id: r.seller_id, storeName: r.seller_store_name, slug: r.seller_slug },
      };
    });

    const subtotalCents = items.filter((i) => i.available).reduce((sum, i) => sum + i.lineTotalCents, 0);
    const shippingCents = shippingFor(subtotalCents);
    return {
      items,
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
      currency: 'USD',
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
    };
  },

  async setQuantity(userId: number, productId: number, quantity: number) {
    const product = await db
      .selectFrom('products')
      .select(['id', 'stock', 'status'])
      .where('id', '=', productId)
      .executeTakeFirst();
    if (!product || product.status !== 'active') throw notFound('Product');
    if (quantity > product.stock) {
      throw unprocessable(`Only ${product.stock} left in stock`, { available: product.stock });
    }

    await db
      .insertInto('cart_items')
      .values({ user_id: userId, product_id: productId, quantity })
      .onConflict((oc) => oc.columns(['user_id', 'product_id']).doUpdateSet({ quantity, updated_at: new Date() }))
      .execute();
    return this.get(userId);
  },

  async remove(userId: number, productId: number) {
    await db.deleteFrom('cart_items').where('user_id', '=', userId).where('product_id', '=', productId).execute();
    return this.get(userId);
  },

  async clear(userId: number) {
    await db.deleteFrom('cart_items').where('user_id', '=', userId).execute();
  },
};
