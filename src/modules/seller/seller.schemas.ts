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

export const InventoryRow = registry.register(
  'InventoryRow',
  z.object({
    productId: z.number().int(),
    name: z.string(),
    status: z.enum(['draft', 'active', 'archived']),
    stock: z.number().int(),
    lowStockThreshold: z.number().int(),
    lowStock: z.boolean(),
    updatedAt: z.string(),
  }),
);

export const BulkInventoryBody = z.object({
  items: z
    .array(z.object({ productId: z.number().int().positive(), stock: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(1000),
  reason: z.string().max(200).default('bulk update'),
});

export const InventoryAdjustment = registry.register(
  'InventoryAdjustment',
  z.object({
    id: z.number().int(),
    delta: z.number().int(),
    stockAfter: z.number().int(),
    reason: z.string(),
    createdAt: z.string(),
  }),
);

export const SellerOrderSummary = registry.register(
  'SellerOrderSummary',
  z.object({
    orderId: z.number().int(),
    createdAt: z.string(),
    buyerName: z.string(),
    itemCount: z.number().int(),
    totalCents: z.number().int(),
    fulfilment: z.enum(['pending', 'partially_shipped', 'shipped', 'delivered', 'cancelled']),
  }),
);

export const SellerOrderDetail = registry.register(
  'SellerOrderDetail',
  z.object({
    orderId: z.number().int(),
    createdAt: z.string(),
    buyerName: z.string(),
    shippingAddress: ShippingAddressSchema,
    totalCents: z.number().int(),
    items: z.array(
      z.object({
        id: z.number().int(),
        productId: z.number().int(),
        productName: z.string(),
        unitPriceCents: z.number().int(),
        quantity: z.number().int(),
        status: z.enum(['pending', 'shipped', 'delivered', 'cancelled']),
        trackingNumber: z.string().nullable(),
        shippedAt: z.string().nullable(),
        deliveredAt: z.string().nullable(),
      }),
    ),
  }),
);

export const DashboardQuery = z.object({ range: z.enum(['7d', '30d', '90d', 'mtd']).default('30d') });

const Kpis = z.object({
  revenueCents: z.number().int(),
  orders: z.number().int(),
  units: z.number().int(),
  averageOrderCents: z.number().int(),
  customers: z.number().int(),
});

export const DashboardSchema = registry.register(
  'SellerDashboard',
  z.object({
    range: z.object({ from: z.string(), to: z.string() }),
    kpis: Kpis,
    previous: Kpis,
    salesByDay: z.array(z.object({ date: z.string(), revenueCents: z.number().int(), orders: z.number().int() })),
    topProducts: z.array(
      z.object({ productId: z.number().int(), name: z.string(), units: z.number().int(), revenueCents: z.number().int() }),
    ),
    lowStock: z.object({
      count: z.number().int(),
      items: z.array(z.object({ productId: z.number().int(), name: z.string(), stock: z.number().int() })),
    }),
    pendingShipments: z.number().int(),
  }),
);

export const PayoutsSchema = registry.register(
  'SellerPayouts',
  z.object({
    feePercent: z.number(),
    months: z.array(
      z.object({
        month: z.string(),
        grossCents: z.number().int(),
        feeCents: z.number().int(),
        netCents: z.number().int(),
        status: z.enum(['open', 'scheduled', 'paid']),
        paidAt: z.string().nullable(),
      }),
    ),
    totals: z.object({ grossCents: z.number().int(), feeCents: z.number().int(), netCents: z.number().int() }),
  }),
);

export const ExportQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});
