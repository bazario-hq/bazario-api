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
};
