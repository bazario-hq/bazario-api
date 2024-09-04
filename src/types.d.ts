import type { UserRole } from './db/types.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: UserRole;
        sellerId?: number | null;
      };
    }
  }
}

export {};
