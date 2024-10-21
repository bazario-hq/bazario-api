import type { NextFunction, Request, Response } from 'express';
import type { Seller } from '../../db/types.js';
import { forbidden } from '../../lib/errors.js';
import { sellersRepository } from '../sellers/sellers.repository.js';

/** Loads the active seller account for the current user into res.locals.seller. */
export async function loadSeller(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) return next(forbidden());
    const seller = await sellersRepository.findByUserId(req.user.id);
    if (!seller || seller.status !== 'active') return next(forbidden('An active seller account is required'));
    res.locals.seller = seller;
    next();
  } catch (err) {
    next(err);
  }
}

export const currentSeller = (res: Response): Seller => res.locals.seller as Seller;
