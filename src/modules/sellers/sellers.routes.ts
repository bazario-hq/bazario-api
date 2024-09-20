import { Router } from 'express';
import { conflict, notFound } from '../../lib/errors.js';
import { route } from '../../lib/route.js';
import { slugify, uniqueSuffix } from '../../lib/slug.js';
import { imageUrl } from '../../lib/storage.js';
import { recordAudit } from '../../lib/audit.js';
import { SlugParams } from '../catalog/catalog.schemas.js';
import { sellersRepository } from './sellers.repository.js';
import { SellerApplyBody, SellerProfile, Storefront } from './sellers.schemas.js';

export const sellersRouter = Router();
const mount = '/sellers';
const tags = ['Sellers'];

export function toSellerProfile(s: Awaited<ReturnType<typeof sellersRepository.findById>> & object) {
  return {
    id: s.id,
    storeName: s.store_name,
    slug: s.slug,
    description: s.description,
    supportEmail: s.support_email,
    status: s.status,
    createdAt: s.created_at.toISOString(),
  };
}

route(
  sellersRouter,
  mount,
  {
    method: 'get',
    path: '/{slug}',
    summary: 'Seller storefront',
    tags,
    params: SlugParams,
    responses: { 200: { description: 'Storefront', schema: Storefront }, 404: { description: 'Not found' } },
  },
  async ({ params }) => {
    const seller = await sellersRepository.findBySlug(params.slug);
    if (!seller || seller.status !== 'active') throw notFound('Seller');
    const stats = await sellersRepository.storefrontStats(seller.id);
    return {
      id: seller.id,
      storeName: seller.store_name,
      slug: seller.slug,
      description: seller.description,
      logoUrl: seller.logo_key ? imageUrl(seller.logo_key) : null,
      memberSince: seller.created_at.toISOString(),
      stats,
    };
  },
);
