import { db } from '../../db/index.js';

const columns = ['id', 'product_id', 'storage_key', 'variants', 'width', 'height', 'alt_text', 'position'] as const;

export const productImagesRepository = {
  forProduct(productId: number) {
    return db
      .selectFrom('product_images')
      .select(columns)
      .where('product_id', '=', productId)
      .orderBy('position')
      .orderBy('id')
      .execute();
  },

  primaryImage(productId: number) {
    return db
      .selectFrom('product_images')
      .select(columns)
      .where('product_id', '=', productId)
      .orderBy('position')
      .orderBy('id')
      .limit(1)
      .executeTakeFirst();
  },

  /** First image of each product, in one query. */
  async primaryImages(productIds: number[]) {
    if (productIds.length === 0) return new Map<number, Awaited<ReturnType<typeof this.primaryImage>>>();
    const rows = await db
      .selectFrom('product_images')
      .select(columns)
      .distinctOn('product_id')
      .where('product_id', 'in', productIds)
      .orderBy('product_id')
      .orderBy('position')
      .orderBy('id')
      .execute();
    return new Map(rows.map((r) => [r.product_id, r]));
  },

  findById(id: number) {
    return db.selectFrom('product_images').selectAll().where('id', '=', id).executeTakeFirst();
  },
};
