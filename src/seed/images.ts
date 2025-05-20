import { HeadObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { config } from '../config.js';
import type { ImageVariants } from '../db/types.js';
import { VARIANT_WIDTHS } from '../lib/images.js';
import { ensureBucket, putObject, s3 } from '../lib/storage.js';
import { Rng } from './random.js';

// Product photos are generated, not downloaded: a studio-style backdrop, a
// lit object and camera grain, saved at phone-camera sizes. Products share a
// fixed pool of photos so the bucket stays a sensible size.

export interface PoolImage {
  index: number;
  storageKey: string;
  variants: ImageVariants;
  width: number;
  height: number;
}

const BACKDROPS = [
  ['#f4efe6', '#d9cfbf'],
  ['#eef2f3', '#c9d3d6'],
  ['#f6ece9', '#dcc4bd'],
  ['#edf0e6', '#c8cfb8'],
  ['#f2f2f2', '#cfcfcf'],
  ['#efe9f3', '#d0c5d9'],
];
const OBJECT_COLOURS = ['#1f3a5f', '#b5523b', '#c89b3c', '#4f6f52', '#7a4e2d', '#2e2e2e', '#8c2f39', '#3b7080', '#d4a373', '#6d597a'];
const SHAPES = ['bowl', 'vase', 'box', 'cushion', 'bottle', 'stack'] as const;

const VERSION = 1;

export function imagePool(seed: number, count: number): PoolImage[] {
  const rng = new Rng(seed, 'image-pool');
  const pool: PoolImage[] = [];
  for (let index = 0; index < count; index++) {
    const ratio = rng.pick([1, 1, 1, 4 / 3, 4 / 3, 3 / 4]);
    const width = rng.int(18, 30) * 100;
    const height = Math.round(width / ratio);
    const base = `products/seed/${String(index).padStart(4, '0')}-${rng.hex(4)}`;
    pool.push({
      index,
      storageKey: `${base}/original.jpg`,
      variants: { thumb: `${base}/thumb.jpg`, medium: `${base}/medium.jpg`, large: `${base}/large.jpg` },
      width,
      height,
    });
  }
  return pool;
}

function svgFor(img: PoolImage, rng: Rng) {
  const { width: w, height: h } = img;
  const [bg1, bg2] = rng.pick(BACKDROPS);
  const colour = rng.pick(OBJECT_COLOURS);
  const accent = rng.pick(OBJECT_COLOURS);
  const shape = rng.pick(SHAPES);
  const cx = w / 2 + rng.int(-w / 12, w / 12);
  const floor = h * rng.int(68, 80) / 100;
  const size = Math.min(w, h) * rng.int(28, 42) / 100;

  let object = '';
  switch (shape) {
    case 'bowl':
      object = `<path d="M ${cx - size} ${floor - size * 0.7} Q ${cx} ${floor + size * 0.35} ${cx + size} ${floor - size * 0.7} Z" fill="url(#obj)"/>
        <ellipse cx="${cx}" cy="${floor - size * 0.7}" rx="${size}" ry="${size * 0.18}" fill="${accent}" opacity="0.85"/>`;
      break;
    case 'vase':
      object = `<path d="M ${cx - size * 0.25} ${floor - size * 1.9} C ${cx - size * 0.2} ${floor - size * 1.2}, ${cx - size * 0.8} ${floor - size * 0.9}, ${cx - size * 0.5} ${floor}
        L ${cx + size * 0.5} ${floor} C ${cx + size * 0.8} ${floor - size * 0.9}, ${cx + size * 0.2} ${floor - size * 1.2}, ${cx + size * 0.25} ${floor - size * 1.9} Z" fill="url(#obj)"/>`;
      break;
    case 'box':
      object = `<rect x="${cx - size}" y="${floor - size * 1.1}" width="${size * 2}" height="${size * 1.1}" rx="${size * 0.06}" fill="url(#obj)"/>
        <rect x="${cx - size}" y="${floor - size * 1.1}" width="${size * 2}" height="${size * 0.22}" fill="${accent}" opacity="0.8"/>`;
      break;
    case 'cushion':
      object = `<rect x="${cx - size}" y="${floor - size * 1.5}" width="${size * 2}" height="${size * 1.5}" rx="${size * 0.35}" fill="url(#obj)"/>
        <path d="M ${cx - size * 0.8} ${floor - size * 0.75} H ${cx + size * 0.8}" stroke="${accent}" stroke-width="${size * 0.08}" stroke-dasharray="${size * 0.12} ${size * 0.08}"/>`;
      break;
    case 'bottle':
      object = `<rect x="${cx - size * 0.38}" y="${floor - size * 1.6}" width="${size * 0.76}" height="${size * 1.6}" rx="${size * 0.12}" fill="url(#obj)"/>
        <rect x="${cx - size * 0.14}" y="${floor - size * 2.05}" width="${size * 0.28}" height="${size * 0.5}" fill="${accent}"/>
        <rect x="${cx - size * 0.3}" y="${floor - size * 1.05}" width="${size * 0.6}" height="${size * 0.45}" fill="#f5f1e8" opacity="0.9"/>`;
      break;
    case 'stack':
      for (let i = 0; i < 4; i++) {
        const y = floor - (i + 1) * size * 0.32;
        object += `<rect x="${cx - size * (1 - i * 0.12)}" y="${y}" width="${size * 2 * (1 - i * 0.12)}" height="${size * 0.3}" rx="${size * 0.05}" fill="${i % 2 ? accent : 'url(#obj)'}"/>`;
      }
      break;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bg1}"/><stop offset="1" stop-color="${bg2}"/></linearGradient>
    <radialGradient id="obj" cx="0.35" cy="0.3" r="0.9"><stop offset="0" stop-color="#ffffff" stop-opacity="0.55"/><stop offset="0.35" stop-color="${colour}"/><stop offset="1" stop-color="#000000" stop-opacity="0.9"/></radialGradient>
    <radialGradient id="shadow"><stop offset="0" stop-color="#000" stop-opacity="0.35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect y="${floor}" width="${w}" height="${h - floor}" fill="${bg2}" opacity="0.6"/>
  <ellipse cx="${cx}" cy="${floor + size * 0.04}" rx="${size * 1.3}" ry="${size * 0.16}" fill="url(#shadow)"/>
  ${object}
</svg>`;
}

/** Renders one pool photo: original plus the same variants the upload path makes. */
export async function renderPoolImage(seed: number, img: PoolImage) {
  const rng = new Rng(seed, `image-${img.index}`);
  const svg = Buffer.from(svgFor(img, rng));
  const grain = await sharp({
    create: { width: img.width, height: img.height, channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: rng.int(18, 28) } },
  })
    .png()
    .toBuffer();
  // Coarser grain survives downscaling, so the variants carry texture too.
  const coarse = await sharp({
    create: { width: Math.round(img.width / 6), height: Math.round(img.height / 6), channels: 3, background: '#808080', noise: { type: 'gaussian', mean: 128, sigma: 40 } },
  })
    .resize(img.width, img.height, { kernel: 'cubic' })
    .png()
    .toBuffer();
  const original = await sharp(svg)
    .composite([
      { input: coarse, blend: 'soft-light' },
      { input: grain, blend: 'soft-light' },
    ])
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();

  const variants: Record<keyof ImageVariants, Buffer> = { thumb: Buffer.alloc(0), medium: Buffer.alloc(0), large: Buffer.alloc(0) };
  for (const [name, width] of Object.entries(VARIANT_WIDTHS) as [keyof ImageVariants, number][]) {
    variants[name] = await sharp(original).rotate().resize({ width, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  }
  return { original, variants };
}

async function exists(key: string) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

/** Uploads the photo pool to object storage, skipping work when it is already there. */
export async function uploadImagePool(seed: number, pool: PoolImage[], log: (msg: string) => void, concurrency = 4) {
  await ensureBucket();
  const marker = `products/seed/pool-v${VERSION}-${seed}-${pool.length}.json`;
  if (await exists(marker)) {
    log(`image pool already uploaded (${pool.length} photos)`);
    return { uploaded: 0, bytes: 0 };
  }

  let next = 0;
  let bytes = 0;
  let done = 0;
  const worker = async () => {
    while (next < pool.length) {
      const img = pool[next++];
      const rendered = await renderPoolImage(seed, img);
      await putObject(img.storageKey, rendered.original, 'image/jpeg');
      bytes += rendered.original.length;
      for (const name of Object.keys(rendered.variants) as (keyof ImageVariants)[]) {
        await putObject(img.variants[name], rendered.variants[name], 'image/jpeg');
        bytes += rendered.variants[name].length;
      }
      done++;
      if (done % 50 === 0) log(`  images ${done}/${pool.length}`);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  await putObject(marker, Buffer.from(JSON.stringify({ seed, count: pool.length, bytes })), 'application/json');
  return { uploaded: pool.length, bytes };
}
