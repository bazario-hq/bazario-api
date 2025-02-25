import type { Request } from 'express';
import { db } from '../../db/index.js';
import type { ImageVariants, Product } from '../../db/types.js';
import { recordAudit } from '../../lib/audit.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { storeProductImage } from '../../lib/images.js';
import { formatCents } from '../../lib/money.js';
import { pageMeta } from '../../lib/pagination.js';
import { slugify, uniqueSuffix } from '../../lib/slug.js';
import { deleteObject } from '../../lib/storage.js';
import { serializeImage } from '../common/serializers.js';
import { productImagesRepository } from '../catalog/images.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';

type ImageRow = Awaited<ReturnType<typeof productImagesRepository.forProduct>>[number];

function toSellerProduct(p: Product, images: ImageRow[]) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceCents: p.price_cents,
    compareAtCents: p.compare_at_cents,
    currency: p.currency,
    stock: p.stock,
    lowStockThreshold: p.low_stock_threshold,
    status: p.status,
    categoryId: p.category_id,
    specs: p.specs,
    ratingAvg: p.rating_avg,
    ratingCount: p.rating_count,
    salesCount: p.sales_count,
    images: images.map((img) => serializeImage({ ...img, variants: img.variants as ImageVariants })),
    createdAt: p.created_at.toISOString(),
    updatedAt: p.updated_at.toISOString(),
  };
}

async function ownedProduct(sellerId: number, productId: number) {
  const product = await db
    .selectFrom('products')
    .selectAll()
    .where('id', '=', productId)
    .where('seller_id', '=', sellerId)
    .executeTakeFirst();
  if (!product) throw notFound('Product');
  return product;
}

async function assertCategory(categoryId: number) {
  const category = await db.selectFrom('categories').select('id').where('id', '=', categoryId).executeTakeFirst();
  if (!category) throw badRequest('Unknown category');
}

async function notifyPriceDrop(product: Product, oldPriceCents: number) {
  const watchers = await db
    .selectFrom('wishlist_items')
    .select('user_id')
    .where('product_id', '=', product.id)
    .execute();
  for (const { user_id } of watchers) {
    await notificationsService.notify(user_id, {
      type: 'wishlist.price_drop',
      title: 'Price drop on your wishlist',
      body: `${product.name} is now ${formatCents(product.price_cents)} (was ${formatCents(oldPriceCents)})`,
      link: `/products/${product.id}`,
    });
  }
}

export const sellerProductsService = {
  async list(sellerId: number, opts: { status?: string; q?: string; page: number; pageSize: number }) {
    let q = db.selectFrom('products').where('seller_id', '=', sellerId);
    if (opts.status) q = q.where('status', '=', opts.status as Product['status']);
    else q = q.where('status', '!=', 'archived');
    if (opts.q) q = q.where('name', 'ilike', `%${opts.q}%`);

    const rows = await q
      .selectAll()
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(opts.pageSize)
      .offset((opts.page - 1) * opts.pageSize)
      .execute();
    const { count } = await q.select((eb) => eb.fn.countAll<number>().as('count')).executeTakeFirstOrThrow();
    const images = await productImagesRepository.primaryImages(rows.map((r) => r.id));
    return {
      items: rows.map((r) => {
        const img = images.get(r.id);
        return toSellerProduct(r, img ? [img] : []);
      }),
      meta: pageMeta(opts.page, opts.pageSize, Number(count)),
    };
  },

  async get(sellerId: number, productId: number) {
    const product = await ownedProduct(sellerId, productId);
    return toSellerProduct(product, await productImagesRepository.forProduct(productId));
  },

  async create(req: Request, sellerId: number, input: {
    name: string;
    description: string;
    priceCents: number;
    compareAtCents?: number | null;
    categoryId: number;
    stock: number;
    lowStockThreshold: number;
    specs: Record<string, string>;
    status: 'draft' | 'active';
  }) {
    await assertCategory(input.categoryId);
    const product = await db
      .insertInto('products')
      .values({
        seller_id: sellerId,
        category_id: input.categoryId,
        name: input.name,
        slug: `${slugify(input.name)}-${uniqueSuffix()}`,
        description: input.description,
        price_cents: input.priceCents,
        compare_at_cents: input.compareAtCents ?? null,
        stock: input.stock,
        low_stock_threshold: input.lowStockThreshold,
        specs: JSON.stringify(input.specs),
        status: input.status,
        published_at: input.status === 'active' ? new Date() : null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    if (input.stock > 0) {
      await db
        .insertInto('inventory_adjustments')
        .values({ product_id: product.id, delta: input.stock, stock_after: input.stock, reason: 'initial stock', actor_id: req.user!.id })
        .execute();
    }
    await recordAudit(req, { action: 'product.create', entityType: 'product', entityId: product.id });
    return toSellerProduct(product, []);
  },

  async update(req: Request, sellerId: number, productId: number, input: {
    name?: string;
    description?: string;
    priceCents?: number;
    compareAtCents?: number | null;
    categoryId?: number;
    lowStockThreshold?: number;
    specs?: Record<string, string>;
    status?: 'draft' | 'active' | 'archived';
  }) {
    const before = await ownedProduct(sellerId, productId);
    if (input.categoryId) await assertCategory(input.categoryId);

    const updated = await db
      .updateTable('products')
      .set({
        name: input.name,
        description: input.description,
        price_cents: input.priceCents,
        compare_at_cents: input.compareAtCents,
        category_id: input.categoryId,
        low_stock_threshold: input.lowStockThreshold,
        specs: input.specs ? JSON.stringify(input.specs) : undefined,
        status: input.status,
        published_at: input.status === 'active' && !before.published_at ? new Date() : undefined,
        updated_at: new Date(),
      })
      .where('id', '=', productId)
      .returningAll()
      .executeTakeFirstOrThrow();

    await recordAudit(req, {
      action: 'product.update',
      entityType: 'product',
      entityId: productId,
      metadata: { changes: Object.keys(input) },
    });

    if (updated.status === 'active' && input.priceCents != null && input.priceCents < before.price_cents) {
      await notifyPriceDrop(updated, before.price_cents);
    }

    return toSellerProduct(updated, await productImagesRepository.forProduct(productId));
  },

  async archive(req: Request, sellerId: number, productId: number) {
    await ownedProduct(sellerId, productId);
    await db
      .updateTable('products')
      .set({ status: 'archived', updated_at: new Date() })
      .where('id', '=', productId)
      .execute();
    await recordAudit(req, { action: 'product.archive', entityType: 'product', entityId: productId });
  },

  async addImage(sellerId: number, productId: number, file: { buffer: Buffer; mimetype: string }, altText: string | null) {
    await ownedProduct(sellerId, productId);
    const stored = await storeProductImage(productId, file);
    const max = await productImagesRepository.maxPosition(productId);
    await db
      .insertInto('product_images')
      .values({
        product_id: productId,
        storage_key: stored.storageKey,
        variants: JSON.stringify(stored.variants),
        width: stored.width,
        height: stored.height,
        position: max?.max == null ? 0 : Number(max.max) + 1,
        alt_text: altText,
      })
      .execute();
    return this.get(sellerId, productId);
  },

  async removeImage(sellerId: number, productId: number, imageId: number) {
    await ownedProduct(sellerId, productId);
    const image = await productImagesRepository.findById(imageId);
    if (!image || image.product_id !== productId) throw notFound('Image');
    await db.deleteFrom('product_images').where('id', '=', imageId).execute();
    const variants = image.variants as ImageVariants;
    for (const key of [image.storage_key, variants.thumb, variants.medium, variants.large]) {
      await deleteObject(key).catch(() => undefined);
    }
  },
};
