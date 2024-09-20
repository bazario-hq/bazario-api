import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { sellersRouter } from './modules/sellers/sellers.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use(catalogRouter);
apiRouter.use(reviewsRouter);
apiRouter.use('/sellers', sellersRouter);
