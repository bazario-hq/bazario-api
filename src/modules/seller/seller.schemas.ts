import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ImageSchema, PageMeta, ShippingAddressSchema } from '../common/schemas.js';

export const SellerProductSchema = registry.register(
  'SellerProduct',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    compareAtCents: z.number().int().nullable(),
    currency: z.string(),
    stock: z.number().int(),
    lowStockThreshold: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    categoryId: z.number().int(),
    specs: z.record(z.string()),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    salesCount: z.number().int(),
    images: z.array(ImageSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
);

export const SellerProductList = registry.register(
  'SellerProductList',
  z.object({ items: z.array(SellerProductSchema), meta: PageMeta }),
);

export const CreateProductBody = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().max(20000).default(''),
  priceCents: z.number().int().min(0).max(100_000_00),
  compareAtCents: z.number().int().min(0).nullable().optional(),
  categoryId: z.number().int().positive(),
  stock: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  specs: z.record(z.string().max(500)).default({}),
  status: z.enum(['draft', 'active']).default('draft'),
});

export const UpdateProductBody = z.object({
  name: z.string().trim().min(2).max(200).optional(),
  description: z.string().max(20000).optional(),
  priceCents: z.number().int().min(0).max(100_000_00).optional(),
  compareAtCents: z.number().int().min(0).nullable().optional(),
  categoryId: z.number().int().positive().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  specs: z.record(z.string().max(500)).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
});
