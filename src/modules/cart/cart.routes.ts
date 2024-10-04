import { Router } from 'express';
import { route } from '../../lib/route.js';
import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ImageSchema, SellerSummary } from '../common/schemas.js';
import { cartService } from './cart.service.js';

export const cartRouter = Router();
const mount = '/cart';
const tags = ['Cart'];

export const CartSchema = registry.register(
  'Cart',
  z.object({
    items: z.array(
      z.object({
        productId: z.number().int(),
        name: z.string(),
        slug: z.string(),
        unitPriceCents: z.number().int(),
        quantity: z.number().int(),
        lineTotalCents: z.number().int(),
        stock: z.number().int(),
        available: z.boolean(),
        image: ImageSchema.nullable(),
        seller: SellerSummary,
      }),
    ),
    subtotalCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
    currency: z.string(),
    itemCount: z.number().int(),
  }),
);

const ProductIdParams = z.object({ productId: z.coerce.number().int().positive() });

route(
  cartRouter,
  mount,
  {
    method: 'get',
    path: '',
    summary: 'Your cart',
    tags,
    auth: 'required',
    responses: { 200: { description: 'Cart', schema: CartSchema } },
  },
  ({ user }) => cartService.get(user.id),
);

route(
  cartRouter,
  mount,
  {
    method: 'put',
    path: '/items/{productId}',
    summary: 'Add a product or set its quantity',
    tags,
    auth: 'required',
    params: ProductIdParams,
    body: z.object({ quantity: z.number().int().min(1).max(99) }),
    responses: {
      200: { description: 'Updated cart', schema: CartSchema },
      404: { description: 'Product not found' },
      422: { description: 'Not enough stock' },
    },
  },
  ({ user, params, body }) => cartService.setQuantity(user.id, params.productId, body.quantity),
);

route(
  cartRouter,
  mount,
  {
    method: 'delete',
    path: '/items/{productId}',
    summary: 'Remove a product from the cart',
    tags,
    auth: 'required',
    params: ProductIdParams,
    responses: { 200: { description: 'Updated cart', schema: CartSchema } },
  },
  ({ user, params }) => cartService.remove(user.id, params.productId),
);
