import type { ImageVariants } from '../../db/types.js';
import { serializeImage } from '../common/serializers.js';
import { productImagesRepository } from './images.repository.js';
import type { ProductRow } from './products.repository.js';

type ImageRow = Awaited<ReturnType<typeof productImagesRepository.primaryImage>>;

export function toProductCard(row: ProductRow, image: ImageRow | null | undefined) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    priceCents: row.price_cents,
    compareAtCents: row.compare_at_cents,
    currency: row.currency,
    ratingAvg: row.rating_avg,
    ratingCount: row.rating_count,
    stock: row.stock,
    specs: row.specs,
    image: image ? serializeImage({ ...image, variants: image.variants as ImageVariants }) : null,
    seller: { id: row.seller_id, storeName: row.seller_store_name, slug: row.seller_slug },
    categoryId: row.category_id,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
  };
}

/** Builds cards for a list of rows, loading primary images in one query. */
export async function toProductCards(rows: ProductRow[]) {
  const images = await productImagesRepository.primaryImages(rows.map((r) => r.id));
  return rows.map((row) => toProductCard(row, images.get(row.id)));
}
