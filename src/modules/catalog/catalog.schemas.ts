import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ImageSchema, PageMeta, SellerSummary } from '../common/schemas.js';

export interface CategoryNodeT {
  id: number;
  name: string;
  slug: string;
  children: CategoryNodeT[];
}

export const CategoryNode = registry.register(
  'CategoryNode',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    children: z
      .array(z.unknown())
      .openapi({ type: 'array', items: { $ref: '#/components/schemas/CategoryNode' } }),
  }),
);

export const CategoryTree = z.object({ categories: z.array(CategoryNode) });

export const CategoryRef = registry.register(
  'CategoryRef',
  z.object({ id: z.number().int(), name: z.string(), slug: z.string() }),
);

export const CategoryDetail = registry.register(
  'CategoryDetail',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    breadcrumb: z.array(CategoryRef),
    children: z.array(CategoryRef),
  }),
);

export const ProductCard = registry.register(
  'ProductCard',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    compareAtCents: z.number().int().nullable(),
    currency: z.string(),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    stock: z.number().int(),
    specs: z.record(z.string()),
    image: ImageSchema.nullable(),
    seller: SellerSummary,
    categoryId: z.number().int(),
    publishedAt: z.string().nullable(),
  }),
);

export const SortOption = z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'popular']);

export const ProductSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().optional().openapi({ description: 'Category slug; includes subcategories' }),
  seller: z.string().optional().openapi({ description: 'Seller slug' }),
  minPrice: z.coerce.number().int().min(0).optional().openapi({ description: 'In cents' }),
  maxPrice: z.coerce.number().int().min(0).optional().openapi({ description: 'In cents' }),
  minRating: z.coerce.number().min(0).max(5).optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  sort: SortOption.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type ProductSearchFilters = z.infer<typeof ProductSearchQuery>;

export const CategoryFacet = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  count: z.number().int(),
});

export const ProductSearchResponse = registry.register(
  'ProductSearchResponse',
  z.object({
    items: z.array(ProductCard),
    meta: PageMeta,
    facets: z.object({ categories: z.array(CategoryFacet) }),
  }),
);

export const ProductDetail = registry.register(
  'ProductDetail',
  z.object({
    id: z.number().int(),
    name: z.string(),
    slug: z.string(),
    description: z.string(),
    priceCents: z.number().int(),
    compareAtCents: z.number().int().nullable(),
    currency: z.string(),
    stock: z.number().int(),
    status: z.enum(['draft', 'active', 'archived']),
    specs: z.record(z.string()),
    ratingAvg: z.number(),
    ratingCount: z.number().int(),
    ratingHistogram: z.record(z.number().int()).openapi({ example: { '5': 12, '4': 3, '3': 0, '2': 1, '1': 0 } }),
    images: z.array(ImageSchema),
    seller: SellerSummary.extend({ ratingAvg: z.number().nullable() }),
    category: CategoryRef,
    breadcrumb: z.array(CategoryRef),
    related: z.array(ProductCard),
    inWishlist: z.boolean(),
    publishedAt: z.string().nullable(),
  }),
);

export const HomeResponse = registry.register(
  'HomeResponse',
  z.object({
    categories: z.array(CategoryRef),
    trending: z.array(ProductCard),
    newArrivals: z.array(ProductCard),
    topRated: z.array(ProductCard),
    deals: z.array(ProductCard),
    generatedAt: z.string(),
  }),
);

export const SlugParams = z.object({ slug: z.string().min(1) });
