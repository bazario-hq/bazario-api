import type { ImageVariants, ProductImage } from '../../db/types.js';
import { imageUrl } from '../../lib/storage.js';

export function serializeImage(img: Pick<ProductImage, 'id' | 'storage_key' | 'width' | 'height' | 'alt_text' | 'position'> & { variants: ImageVariants }) {
  return {
    id: img.id,
    url: imageUrl(img.storage_key),
    thumbUrl: imageUrl(img.variants.thumb),
    mediumUrl: imageUrl(img.variants.medium),
    largeUrl: imageUrl(img.variants.large),
    width: img.width,
    height: img.height,
    altText: img.alt_text,
    position: img.position,
  };
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
