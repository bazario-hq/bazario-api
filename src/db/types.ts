import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;
type NullableTimestamp = ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
type Json<T> = ColumnType<T, string | T, string | T>;

export type UserRole = 'buyer' | 'seller' | 'admin';
export type UserStatus = 'active' | 'suspended';
export type SellerStatus = 'pending' | 'active' | 'suspended';
export type ProductStatus = 'draft' | 'active' | 'archived';
export type OrderStatus = 'paid' | 'partially_shipped' | 'shipped' | 'delivered' | 'cancelled';
export type OrderItemStatus = 'pending' | 'shipped' | 'delivered' | 'cancelled';
export type PayoutStatus = 'scheduled' | 'paid';

export interface ShippingAddress {
  fullName: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode: string;
  country: string;
  phone?: string | null;
}

export interface ImageVariants {
  thumb: string;
  medium: string;
  large: string;
}

export interface UsersTable {
  id: Generated<number>;
  email: string;
  password_hash: string;
  name: string;
  role: Generated<UserRole>;
  status: Generated<UserStatus>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  last_login_at: NullableTimestamp;
}

export interface RefreshTokensTable {
  id: Generated<number>;
  user_id: number;
  token_hash: string;
  expires_at: Timestamp;
  revoked_at: NullableTimestamp;
  user_agent: string | null;
  created_at: Generated<Date>;
}

export interface CategoriesTable {
  id: Generated<number>;
  parent_id: number | null;
  name: string;
  slug: string;
  description: string | null;
  position: Generated<number>;
  created_at: Generated<Date>;
}

export interface SellersTable {
  id: Generated<number>;
  user_id: number;
  store_name: string;
  slug: string;
  description: string | null;
  logo_key: string | null;
  support_email: string | null;
  status: Generated<SellerStatus>;
  approved_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductsTable {
  id: Generated<number>;
  seller_id: number;
  category_id: number;
  name: string;
  slug: string;
  description: string;
  price_cents: number;
  compare_at_cents: number | null;
  currency: Generated<string>;
  stock: Generated<number>;
  low_stock_threshold: Generated<number>;
  status: Generated<ProductStatus>;
  rating_avg: Generated<number>;
  rating_count: Generated<number>;
  sales_count: Generated<number>;
  specs: Json<Record<string, string>>;
  published_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductImagesTable {
  id: Generated<number>;
  product_id: number;
  storage_key: string;
  variants: Json<ImageVariants>;
  width: number;
  height: number;
  position: Generated<number>;
  alt_text: string | null;
  created_at: Generated<Date>;
}

export interface ReviewsTable {
  id: Generated<number>;
  product_id: number;
  user_id: number;
  rating: number;
  title: string;
  body: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WishlistItemsTable {
  user_id: number;
  product_id: number;
  created_at: Generated<Date>;
}

export interface CartItemsTable {
  user_id: number;
  product_id: number;
  quantity: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrdersTable {
  id: Generated<number>;
  buyer_id: number;
  status: Generated<OrderStatus>;
  subtotal_cents: number;
  shipping_cents: number;
  total_cents: number;
  currency: Generated<string>;
  shipping_address: Json<ShippingAddress>;
  payment_ref: string;
  payment_last4: string;
  cancelled_at: NullableTimestamp;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface OrderItemsTable {
  id: Generated<number>;
  order_id: number;
  product_id: number;
  seller_id: number;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  status: Generated<OrderItemStatus>;
  tracking_number: string | null;
  shipped_at: NullableTimestamp;
  delivered_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface NotificationsTable {
  id: Generated<number>;
  user_id: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface AuditLogTable {
  id: Generated<number>;
  actor_id: number | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json<Record<string, unknown>>;
  ip: string | null;
  created_at: Generated<Date>;
}

export interface InventoryAdjustmentsTable {
  id: Generated<number>;
  product_id: number;
  delta: number;
  stock_after: number;
  reason: string;
  actor_id: number | null;
  created_at: Generated<Date>;
}

export interface PayoutsTable {
  id: Generated<number>;
  seller_id: number;
  period_month: ColumnType<string, string, string>;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  status: Generated<PayoutStatus>;
  paid_at: NullableTimestamp;
  created_at: Generated<Date>;
}

export interface Database {
  users: UsersTable;
  refresh_tokens: RefreshTokensTable;
  categories: CategoriesTable;
  sellers: SellersTable;
  products: ProductsTable;
  product_images: ProductImagesTable;
  reviews: ReviewsTable;
  wishlist_items: WishlistItemsTable;
  cart_items: CartItemsTable;
  orders: OrdersTable;
  order_items: OrderItemsTable;
  notifications: NotificationsTable;
  audit_log: AuditLogTable;
  inventory_adjustments: InventoryAdjustmentsTable;
  payouts: PayoutsTable;
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Seller = Selectable<SellersTable>;
export type Product = Selectable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
export type ProductImage = Selectable<ProductImagesTable>;
export type Review = Selectable<ReviewsTable>;
export type Order = Selectable<OrdersTable>;
export type OrderItem = Selectable<OrderItemsTable>;
export type Category = Selectable<CategoriesTable>;
export type Notification = Selectable<NotificationsTable>;
