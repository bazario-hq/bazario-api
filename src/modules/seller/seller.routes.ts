import { Router } from 'express';
import { badRequest } from '../../lib/errors.js';
import { route } from '../../lib/route.js';
import { requireAuth } from '../../middleware/auth.js';
import { z } from '../../openapi/zod.js';
import { IdParams, PageMeta } from '../common/schemas.js';
import { sellersRepository } from '../sellers/sellers.repository.js';
import { toSellerProfile } from '../sellers/sellers.routes.js';
import { SellerProfile } from '../sellers/sellers.schemas.js';
import { currentSeller, loadSeller } from './seller.context.js';
import {
  CreateProductBody,
  SellerProductList,
  SellerProductSchema,
  UpdateProductBody,
} from './seller.schemas.js';
import { sellerProductsService } from './seller-products.service.js';

export const sellerRouter = Router();
sellerRouter.use(requireAuth, loadSeller);

const mount = '/seller';
const tags = ['Seller'];
const auth = 'required' as const;

const pageParams = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

// Profile

route(
  sellerRouter,
  mount,
  { method: 'get', path: '/profile', summary: 'Your seller profile', tags, auth, responses: { 200: { description: 'Profile', schema: SellerProfile } } },
  async ({ res }) => toSellerProfile(currentSeller(res)),
);

// Dashboard

// Products

route(
  sellerRouter,
  mount,
  {
    method: 'get',
    path: '/products',
    summary: 'Your products (excluding archived unless asked)',
    tags,
    auth,
    query: z.object({
      status: z.enum(['draft', 'active', 'archived']).optional(),
      q: z.string().trim().max(100).optional(),
      ...pageParams,
    }),
    responses: { 200: { description: 'Products', schema: SellerProductList } },
  },
  ({ res, query }) => sellerProductsService.list(currentSeller(res).id, query),
);

route(
  sellerRouter,
  mount,
  {
    method: 'post',
    path: '/products',
    summary: 'Create a product',
    tags,
    auth,
    body: CreateProductBody,
    status: 201,
    responses: { 201: { description: 'Created', schema: SellerProductSchema } },
  },
  ({ req, res, body }) => sellerProductsService.create(req, currentSeller(res).id, body),
);

route(
  sellerRouter,
  mount,
  {
    method: 'get',
    path: '/products/{id}',
    summary: 'One of your products',
    tags,
    auth,
    params: IdParams,
    responses: { 200: { description: 'Product', schema: SellerProductSchema }, 404: { description: 'Not found' } },
  },
  ({ res, params }) => sellerProductsService.get(currentSeller(res).id, params.id),
);

route(
  sellerRouter,
  mount,
  {
    method: 'patch',
    path: '/products/{id}',
    summary: 'Update a product',
    tags,
    auth,
    params: IdParams,
    body: UpdateProductBody,
    responses: { 200: { description: 'Updated', schema: SellerProductSchema } },
  },
  ({ req, res, params, body }) => sellerProductsService.update(req, currentSeller(res).id, params.id, body),
);

route(
  sellerRouter,
  mount,
  {
    method: 'delete',
    path: '/products/{id}',
    summary: 'Archive a product',
    tags,
    auth,
    params: IdParams,
    responses: { 204: { description: 'Archived' } },
  },
  async ({ req, res, params }) => {
    await sellerProductsService.archive(req, currentSeller(res).id, params.id);
  },
);

// Inventory

// Orders

// Payouts and exports
