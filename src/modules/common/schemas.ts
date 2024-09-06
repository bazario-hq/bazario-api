import { z } from '../../openapi/zod.js';
import { registry } from '../../openapi/registry.js';

export const PageMeta = registry.register(
  'PageMeta',
  z.object({
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
);

export const IdParams = z.object({ id: z.coerce.number().int().positive().openapi({ example: 42 }) });

export const ImageSchema = registry.register(
  'Image',
  z.object({
    id: z.number().int(),
    url: z.string(),
    thumbUrl: z.string(),
    mediumUrl: z.string(),
    largeUrl: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    altText: z.string().nullable(),
    position: z.number().int(),
  }),
);

export const SellerSummary = registry.register(
  'SellerSummary',
  z.object({
    id: z.number().int(),
    storeName: z.string(),
    slug: z.string(),
  }),
);

export const ShippingAddressSchema = registry.register(
  'ShippingAddress',
  z.object({
    fullName: z.string().min(1).max(120),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).nullish(),
    city: z.string().min(1).max(100),
    postalCode: z.string().min(1).max(20),
    country: z.string().length(2),
    phone: z.string().max(30).nullish(),
  }),
);

export const Timestamp = z.string().datetime().openapi({ example: '2026-10-01T12:00:00.000Z' });
