import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { PageMeta } from '../common/schemas.js';

export const ReviewSchema = registry.register(
  'Review',
  z.object({
    id: z.number().int(),
    productId: z.number().int(),
    rating: z.number().int().min(1).max(5),
    title: z.string(),
    body: z.string(),
    status: z.enum(['published', 'pending', 'rejected']),
    author: z.object({ id: z.number().int(), name: z.string() }),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export const ReviewListQuery = z.object({
  sort: z.enum(['newest', 'highest', 'lowest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
});

export const ReviewList = registry.register(
  'ReviewList',
  z.object({ items: z.array(ReviewSchema), meta: PageMeta }),
);

export const CreateReviewBody = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
});

export const UpdateReviewBody = CreateReviewBody.partial();
