import { Router } from 'express';
import { route } from '../../lib/route.js';
import { IdParams } from '../common/schemas.js';
import {
  CategoryDetail,
  CategoryTree,
  ProductDetail,
  ProductSearchQuery,
  ProductSearchResponse,
  SlugParams,
} from './catalog.schemas.js';
import { categoriesService } from './categories.service.js';
import { productsService } from './products.service.js';

export const catalogRouter = Router();

route(
  catalogRouter,
  '',
  {
    method: 'get',
    path: '/categories',
    summary: 'Full category tree',
    tags: ['Catalog'],
    responses: { 200: { description: 'Category tree', schema: CategoryTree } },
  },
  async () => ({ categories: await categoriesService.tree() }),
);

route(
  catalogRouter,
  '',
  {
    method: 'get',
    path: '/products',
    summary: 'Search and browse products',
    tags: ['Catalog'],
    query: ProductSearchQuery,
    responses: { 200: { description: 'Search results', schema: ProductSearchResponse } },
  },
  ({ query }) => productsService.search(query),
);
