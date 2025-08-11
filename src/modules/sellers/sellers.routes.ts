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
    method: 'post',
    path: '/apply',
    summary: 'Apply to become a seller (reviewed by an admin)',
    tags,
    auth: 'required',
    body: SellerApplyBody,
    status: 201,
    responses: { 201: { description: 'Application created', schema: SellerProfile }, 409: { description: 'Already applied' } },
  },
  async ({ user, body, req }) => {
    const existing = await sellersRepository.findByUserId(user.id);
    if (existing) throw conflict('You already have a seller account');

    let slug = slugify(body.storeName) || 'store';
    if (await sellersRepository.slugExists(slug)) slug = `${slug}-${uniqueSuffix()}`;

    // TODO: let sellers upload a logo during onboarding (BZR-275)
    const seller = await sellersRepository.create({
      user_id: user.id,
      store_name: body.storeName,
      slug,
      description: body.description ?? null,
      support_email: body.supportEmail ?? null,
    });
    await recordAudit(req, { action: 'seller.apply', entityType: 'seller', entityId: seller.id });
    return toSellerProfile(seller);
  },
);

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
