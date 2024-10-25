import crypto from 'node:crypto';
import sharp from 'sharp';
import type { ImageVariants } from '../db/types.js';
import { putObject } from './storage.js';

export const VARIANT_WIDTHS = { thumb: 200, medium: 600, large: 1200 } as const;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const extensionFor: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export interface StoredImage {
  storageKey: string;
  variants: ImageVariants;
  width: number;
  height: number;
}

/** Stores the original upload plus resized variants for product pages and cards. */
export async function storeProductImage(productId: number, file: { buffer: Buffer; mimetype: string }): Promise<StoredImage> {
  const meta = await sharp(file.buffer).metadata();
  const base = `products/${productId}/${crypto.randomBytes(8).toString('hex')}`;
  const storageKey = `${base}/original.${extensionFor[file.mimetype] ?? 'bin'}`;

  await putObject(storageKey, file.buffer, file.mimetype);

  const variants = {} as ImageVariants;
  for (const [name, width] of Object.entries(VARIANT_WIDTHS) as [keyof ImageVariants, number][]) {
    const resized = await sharp(file.buffer).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const key = `${base}/${name}.jpg`;
    await putObject(key, resized, 'image/jpeg');
    variants[name] = key;
  }

  return { storageKey, variants, width: meta.width ?? 0, height: meta.height ?? 0 };
}
