export type SeedSize = 'dev' | 'staging' | 'prod-sim';

export interface SizeConfig {
  /** Buyer accounts. Seller owners and admins are created on top. */
  users: number;
  sellers: number;
  /** The handful of sellers with very large catalogues. */
  bigSellers: number;
  /** Share of all products that belong to the big sellers. */
  bigSellerProductShare: number;
  products: number;
  orders: number;
  /** Buyers who order every week or two (hundreds of orders over two years). */
  powerUsers: number;
  powerUserOrders: [number, number];
  /** Distinct generated photos; products share them. */
  imagePool: number;
  /** Products that went viral and sit in thousands of wishlists. */
  viralProducts: number;
  viralWishlistSize: [number, number];
}

export const SIZES: Record<SeedSize, SizeConfig> = {
  dev: {
    users: 2_000,
    sellers: 40,
    bigSellers: 2,
    bigSellerProductShare: 0.3,
    products: 3_000,
    orders: 12_000,
    powerUsers: 10,
    powerUserOrders: [40, 120],
    imagePool: 40,
    viralProducts: 3,
    viralWishlistSize: [150, 300],
  },
  staging: {
    users: 60_000,
    sellers: 400,
    bigSellers: 4,
    bigSellerProductShare: 0.4,
    products: 40_000,
    orders: 300_000,
    powerUsers: 120,
    powerUserOrders: [150, 500],
    imagePool: 160,
    viralProducts: 6,
    viralWishlistSize: [1_500, 5_500],
  },
  'prod-sim': {
    users: 600_000,
    sellers: 3_000,
    bigSellers: 5,
    bigSellerProductShare: 0.4,
    products: 200_000,
    orders: 2_400_000,
    powerUsers: 600,
    powerUserOrders: [200, 600],
    imagePool: 400,
    viralProducts: 10,
    viralWishlistSize: [3_000, 8_000],
  },
};

/**
 * One growth step ("the business grew since last sprint"): extra buyers,
 * products and orders, with the new orders landing in the most recent weeks.
 */
export const GROWTH = {
  users: 0.05,
  products: 0.05,
  orders: 0.08,
  windowDays: 21,
};

export const HISTORY_DAYS = 730;

// When each feature shipped (matches the migration dates). Nothing is generated
// for a feature before it existed.
export const FEATURE_DATES = {
  orders: Date.UTC(2024, 9, 14),
  notifications: Date.UTC(2024, 10, 20),
  inventory: Date.UTC(2025, 0, 15),
  payouts: Date.UTC(2025, 2, 4),
  moderation: Date.UTC(2025, 5, 10),
};
export const SEED_PASSWORD = 'bazario-demo';
