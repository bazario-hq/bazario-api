import { Router } from 'express';
import { route } from '../../lib/route.js';
import { IdParams } from '../common/schemas.js';
import {
  CategoryDetail,
  CategoryTree,
  HomeResponse,
  ProductDetail,
  ProductSearchQuery,
  ProductSearchResponse,
  SlugParams,
} from './catalog.schemas.js';
import { categoriesService } from './categories.service.js';
import { homeService } from './home.service.js';
import { productsService } from './products.service.js';

export const catalogRouter = Router();

route(
  catalogRouter,
  '',
  {
    method: 'get',
    path: '/home',
    summary: 'Home page sections',
    tags: ['Catalog'],
    responses: { 200: { description: 'Home page', schema: HomeResponse } },
  },
  () => homeService.get(),
);

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
    path: '/categories/{slug}',
    summary: 'A category with its breadcrumb and subcategories',
    tags: ['Catalog'],
    params: SlugParams,
    responses: { 200: { description: 'Category', schema: CategoryDetail }, 404: { description: 'Not found' } },
  },
  ({ params }) => categoriesService.detail(params.slug),
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

route(
  catalogRouter,
  '',
  {
    method: 'get',
    path: '/products/{id}',
    summary: 'Product detail',
    tags: ['Catalog'],
    auth: 'optional',
    params: IdParams,
    responses: { 200: { description: 'Product', schema: ProductDetail }, 404: { description: 'Not found' } },
  },
  ({ params, req }) => productsService.detail(params.id, req.user?.id),
);
