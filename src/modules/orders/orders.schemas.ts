import { registry } from '../../openapi/registry.js';
import { z } from '../../openapi/zod.js';
import { ImageSchema, PageMeta, SellerSummary, ShippingAddressSchema } from '../common/schemas.js';

export const OrderItemSchema = registry.register(
  'OrderItem',
  z.object({
    id: z.number().int(),
    productId: z.number().int(),
    productName: z.string(),
    unitPriceCents: z.number().int(),
    quantity: z.number().int(),
    lineTotalCents: z.number().int(),
    status: z.enum(['pending', 'shipped', 'delivered', 'cancelled']),
    trackingNumber: z.string().nullable(),
    shippedAt: z.string().nullable(),
    deliveredAt: z.string().nullable(),
    image: ImageSchema.nullable(),
    seller: SellerSummary,
  }),
);

export const OrderSchema = registry.register(
  'Order',
  z.object({
    id: z.number().int(),
    status: z.enum(['paid', 'partially_shipped', 'shipped', 'delivered', 'cancelled']),
    subtotalCents: z.number().int(),
    shippingCents: z.number().int(),
    totalCents: z.number().int(),
    currency: z.string(),
    shippingAddress: ShippingAddressSchema,
    paymentLast4: z.string(),
    createdAt: z.string(),
    cancelledAt: z.string().nullable(),
    items: z.array(OrderItemSchema),
  }),
);

export const OrderList = registry.register('OrderList', z.object({ items: z.array(OrderSchema), meta: PageMeta }));
