import { Router } from 'express';
import { route } from '../../lib/route.js';
import { z } from '../../openapi/zod.js';
import { IdParams } from '../common/schemas.js';
import { OrderList, OrderSchema } from './orders.schemas.js';
import { ordersService } from './orders.service.js';

export const ordersRouter = Router();
const mount = '/orders';
const tags = ['Orders'];

route(
  ordersRouter,
  mount,
  {
    method: 'get',
    path: '',
    summary: 'Your order history, newest first',
    tags,
    auth: 'required',
    query: z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    }),
    responses: { 200: { description: 'Orders', schema: OrderList } },
  },
  ({ user, query }) => ordersService.list(user.id, query.page, query.pageSize),
);

route(
  ordersRouter,
  mount,
  {
    method: 'get',
    path: '/{id}',
    summary: 'One of your orders',
    tags,
    auth: 'required',
    params: IdParams,
    responses: { 200: { description: 'Order', schema: OrderSchema }, 404: { description: 'Not found' } },
  },
  ({ user, params }) => ordersService.get(user.id, params.id),
);
