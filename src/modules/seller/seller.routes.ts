import { Router } from 'express';
import multer from 'multer';
import { badRequest } from '../../lib/errors.js';
import { ACCEPTED_IMAGE_TYPES } from '../../lib/images.js';
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
  SellerOrderDetail,
  SellerOrderSummary,
  SellerProductList,
  SellerProductSchema,
  UpdateProductBody,
} from './seller.schemas.js';
import { sellerOrdersService } from './seller-orders.service.js';
import { sellerProductsService } from './seller-products.service.js';

export const sellerRouter = Router();
sellerRouter.use(requireAuth, loadSeller);

const mount = '/seller';
const tags = ['Seller'];
const auth = 'required' as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_IMAGE_TYPES.includes(file.mimetype)) cb(null, true);
    else cb(badRequest('Images must be JPEG, PNG or WebP'));
  },
});

const ProductImageParams = z.object({
  id: z.coerce.number().int().positive(),
  imageId: z.coerce.number().int().positive(),
});
const OrderIdParams = z.object({ orderId: z.coerce.number().int().positive() });
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

route(
  sellerRouter,
  mount,
  {
    method: 'post',
    path: '/products/{id}/images',
    summary: 'Upload a product image (multipart field "image")',
    tags,
    auth,
    params: IdParams,
    body: z.object({
      image: z.string().openapi({ type: 'string', format: 'binary' }),
      altText: z.string().max(200).optional(),
    }),
    bodyContentType: 'multipart/form-data',
    middleware: [upload.single('image')],
    status: 201,
    responses: { 201: { description: 'Product with the new image', schema: SellerProductSchema } },
  },
  async ({ req, res, params }) => {
    if (!req.file) throw badRequest('Missing "image" file');
    const altText = typeof req.body?.altText === 'string' ? req.body.altText.slice(0, 200) : null;
    return sellerProductsService.addImage(currentSeller(res).id, params.id, req.file, altText);
  },
);

route(
  sellerRouter,
  mount,
  {
    method: 'delete',
    path: '/products/{id}/images/{imageId}',
    summary: 'Delete a product image',
    tags,
    auth,
    params: ProductImageParams,
    responses: { 204: { description: 'Deleted' } },
  },
  async ({ res, params }) => {
    await sellerProductsService.removeImage(currentSeller(res).id, params.id, params.imageId);
  },
);

// Inventory

// Orders

route(
  sellerRouter,
  mount,
  {
    method: 'get',
    path: '/orders',
    summary: 'Orders that contain your products',
    tags,
    auth,
    query: z.object({ status: z.enum(['pending', 'shipped', 'delivered', 'cancelled']).optional(), ...pageParams }),
    responses: {
      200: { description: 'Orders', schema: z.object({ items: z.array(SellerOrderSummary), meta: PageMeta }) },
    },
  },
  ({ res, query }) => sellerOrdersService.list(currentSeller(res).id, query),
);

route(
  sellerRouter,
  mount,
  {
    method: 'get',
    path: '/orders/{orderId}',
    summary: 'Your items in an order',
    tags,
    auth,
    params: OrderIdParams,
    responses: { 200: { description: 'Order', schema: SellerOrderDetail }, 404: { description: 'Not found' } },
  },
  ({ res, params }) => sellerOrdersService.get(currentSeller(res).id, params.orderId),
);

route(
  sellerRouter,
  mount,
  {
    method: 'post',
    path: '/orders/{orderId}/ship',
    summary: 'Mark items as shipped',
    tags,
    auth,
    params: OrderIdParams,
    body: z.object({
      itemIds: z.array(z.number().int().positive()).optional(),
      trackingNumber: z.string().trim().min(3).max(60),
    }),
    responses: { 200: { description: 'Order', schema: SellerOrderDetail }, 409: { description: 'Nothing to ship' } },
  },
  ({ res, params, body }) => sellerOrdersService.ship(currentSeller(res).id, params.orderId, body),
);

route(
  sellerRouter,
  mount,
  {
    method: 'post',
    path: '/orders/{orderId}/deliver',
    summary: 'Mark shipped items as delivered',
    tags,
    auth,
    params: OrderIdParams,
    body: z.object({ itemIds: z.array(z.number().int().positive()).optional() }),
    responses: { 200: { description: 'Order', schema: SellerOrderDetail }, 409: { description: 'Nothing to deliver' } },
  },
  ({ res, params, body }) => sellerOrdersService.deliver(currentSeller(res).id, params.orderId, body.itemIds),
);

// Payouts and exports
