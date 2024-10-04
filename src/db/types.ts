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
  status: Generated<ProductStatus>;
  rating_avg: Generated<number>;
  rating_count: Generated<number>;
  specs: Json<Record<string, string>>;
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
}

export type User = Selectable<UsersTable>;
export type NewUser = Insertable<UsersTable>;
export type Seller = Selectable<SellersTable>;
export type Product = Selectable<ProductsTable>;
export type ProductUpdate = Updateable<ProductsTable>;
export type ProductImage = Selectable<ProductImagesTable>;
export type Review = Selectable<ReviewsTable>;
export type Category = Selectable<CategoriesTable>;
