import { Router } from 'express';
import { route } from '../../lib/route.js';
import { IdParams } from '../common/schemas.js';
import { CreateReviewBody, ReviewList, ReviewListQuery, ReviewSchema, UpdateReviewBody } from './reviews.schemas.js';
import { reviewsService } from './reviews.service.js';

export const reviewsRouter = Router();
const tags = ['Reviews'];

route(
  reviewsRouter,
  '',
  {
    method: 'get',
    path: '/products/{id}/reviews',
    summary: 'Published reviews for a product',
    tags,
    params: IdParams,
    query: ReviewListQuery,
    responses: { 200: { description: 'Reviews', schema: ReviewList }, 404: { description: 'Product not found' } },
  },
  ({ params, query }) => reviewsService.list(params.id, query.sort, query.page, query.pageSize),
);

route(
  reviewsRouter,
  '',
  {
    method: 'post',
    path: '/products/{id}/reviews',
    summary: 'Review a purchased product',
    tags,
    auth: 'required',
    params: IdParams,
    body: CreateReviewBody,
    status: 201,
    responses: {
      201: { description: 'Review created (may be held for moderation)', schema: ReviewSchema },
      403: { description: 'Not purchased' },
      409: { description: 'Already reviewed' },
    },
  },
  ({ user, params, body }) => reviewsService.create(user.id, params.id, body),
);

route(
  reviewsRouter,
  '',
  {
    method: 'patch',
    path: '/reviews/{id}',
    summary: 'Edit your review',
    tags,
    auth: 'required',
    params: IdParams,
    body: UpdateReviewBody,
    responses: { 200: { description: 'Updated', schema: ReviewSchema } },
  },
  ({ user, params, body }) => reviewsService.update(user.id, params.id, body),
);

route(
  reviewsRouter,
  '',
  {
    method: 'delete',
    path: '/reviews/{id}',
    summary: 'Delete your review',
    tags,
    auth: 'required',
    params: IdParams,
    responses: { 204: { description: 'Deleted' } },
  },
  async ({ user, params }) => {
    await reviewsService.remove(user.id, user.role, params.id);
  },
);
