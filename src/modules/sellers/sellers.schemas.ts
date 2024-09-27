import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';

export const Storefront = registry.register(
  'Storefront',
  z.object({
    id: z.number().int(),
    storeName: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    logoUrl: z.string().nullable(),
    memberSince: z.string(),
    stats: z.object({
      productCount: z.number().int(),
      unitsSold: z.number().int(),
      ratingAvg: z.number().nullable(),
      reviewCount: z.number().int(),
    }),
  }),
);

export const SellerApplyBody = z.object({
  storeName: z.string().trim().min(2).max(80),
  description: z.string().max(2000).optional(),
  supportEmail: z.string().email().optional(),
});

export const SellerProfile = registry.register(
  'SellerProfile',
  z.object({
    id: z.number().int(),
    storeName: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    supportEmail: z.string().nullable(),
    status: z.enum(['pending', 'active', 'suspended']),
    createdAt: z.string(),
  }),
);
