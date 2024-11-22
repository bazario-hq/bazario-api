import { Router } from 'express';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { cartRouter } from './modules/cart/cart.routes.js';
import { catalogRouter } from './modules/catalog/catalog.routes.js';
import { checkoutRouter } from './modules/checkout/checkout.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { ordersRouter } from './modules/orders/orders.routes.js';
import { reviewsRouter } from './modules/reviews/reviews.routes.js';
import { sellerRouter } from './modules/seller/seller.routes.js';
import { sellersRouter } from './modules/sellers/sellers.routes.js';
import { wishlistRouter } from './modules/wishlist/wishlist.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use(catalogRouter);
apiRouter.use(reviewsRouter);
apiRouter.use('/sellers', sellersRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/cart', cartRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/orders', ordersRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/seller', sellerRouter);
apiRouter.use('/admin', adminRouter);
