import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as addressController from '../controllers/address.controller.js';
import * as wishlistController from '../controllers/wishlist.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as walletController from '../controllers/wallet.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as cartController from '../controllers/cart.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as recentlyViewedController from '../controllers/recentlyViewed.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle, uploadMultiple } from '../../../middlewares/upload.js';
import {
    registerSchema,
    loginSchema,
    otpSchema,
    resendOtpSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    updateProfileSchema,
    changePasswordSchema,
} from '../validators/auth.validator.js';
import {
    createAddressSchema,
    updateAddressSchema,
} from '../validators/address.validator.js';
import { placeOrderSchema, createReturnRequestSchema, cancelVendorItemSchema } from '../validators/order.validator.js';

const router = Router();
const customerAuth = [authenticate, authorize('customer'), enforceAccountStatus];

// Auth routes
router.post('/auth/register', authLimiter, validate(registerSchema), authController.register);
router.post('/auth/verify-otp', otpVerifyLimiter, validate(otpSchema), authController.verifyOTP);
router.post('/auth/resend-otp', otpLimiter, validate(resendOtpSchema), authController.resendOTP);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...customerAuth, authController.getProfile);
router.put('/auth/profile', ...customerAuth, validate(updateProfileSchema), authController.updateProfile);
router.post('/auth/profile/avatar', ...customerAuth, uploadSingle('avatar'), authController.uploadProfileAvatar);
router.post('/auth/change-password', ...customerAuth, validate(changePasswordSchema), authController.changePassword);

// Address routes (protected)
router.get('/addresses', ...customerAuth, addressController.getAddresses);
router.post('/addresses', ...customerAuth, validate(createAddressSchema), addressController.addAddress);
router.put('/addresses/:id', ...customerAuth, validate(updateAddressSchema), addressController.updateAddress);
router.delete('/addresses/:id', ...customerAuth, addressController.deleteAddress);
router.patch('/addresses/:id/default', ...customerAuth, addressController.setDefaultAddress);

// Wishlist routes (protected)
router.get('/wishlist', ...customerAuth, wishlistController.getWishlist);
router.post('/wishlist', ...customerAuth, wishlistController.addToWishlist);
router.delete('/wishlist/:productId', ...customerAuth, wishlistController.removeFromWishlist);
router.post('/wishlist/move-selected', ...customerAuth, wishlistController.moveSelectedToCart);
router.post('/wishlist/remove-selected', ...customerAuth, wishlistController.removeSelectedFromWishlist);

// Review routes
router.get('/reviews/product/:productId', reviewController.getProductReviews);
router.post('/reviews', ...customerAuth, reviewController.addReview);
router.post('/reviews/:id/vote', ...customerAuth, reviewController.voteReview);
router.delete('/reviews/:id', ...customerAuth, reviewController.deleteReview);
router.post('/products/:productId/review', ...customerAuth, uploadMultiple('images', 5), reviewController.addReview);
router.patch('/products/:productId/review', ...customerAuth, uploadMultiple('images', 5), reviewController.updateReview);

// Order routes
router.post('/orders', ...customerAuth, validate(placeOrderSchema), orderController.placeOrder);
router.get('/orders', ...customerAuth, orderController.getUserOrders);
router.get('/orders/:id', ...customerAuth, orderController.getOrderDetail);
router.patch('/orders/:id/cancel', ...customerAuth, orderController.cancelOrder);
router.patch('/orders/:id/items/:vendorItemId/cancel', ...customerAuth, validate(cancelVendorItemSchema), orderController.cancelVendorItem);
router.post('/orders/:id/returns', ...customerAuth, uploadMultiple('images', 5), validate(createReturnRequestSchema), orderController.createReturnRequest);
router.get('/returns', ...customerAuth, orderController.getUserReturnRequests);
router.get('/returns/:id', ...customerAuth, orderController.getUserReturnRequestById);
router.post('/returns/:id/regenerate-otp', ...customerAuth, orderController.regenerateReturnPickupOtp);

// Notification routes (protected)
router.get('/notifications', ...customerAuth, notificationController.getUserNotifications);
router.put('/notifications/:id/read', ...customerAuth, notificationController.markUserNotificationAsRead);
router.put('/notifications/read-all', ...customerAuth, notificationController.markAllUserNotificationsAsRead);
router.delete('/notifications/:id', ...customerAuth, notificationController.deleteUserNotification);

// Cart routes (protected)
router.get('/cart', ...customerAuth, cartController.getCart);
router.post('/cart/add', ...customerAuth, cartController.addToCart);
router.put('/cart/update', ...customerAuth, cartController.updateCartItem);
router.delete('/cart/item/:itemId', ...customerAuth, cartController.removeFromCart);
router.delete('/cart/clear', ...customerAuth, cartController.clearCart);
router.post('/cart/merge', ...customerAuth, cartController.mergeCart);

// Support routes (protected)
router.post('/support/tickets', ...customerAuth, supportController.createTicket);
router.get('/support/tickets', ...customerAuth, supportController.getUserTickets);
router.get('/support/tickets/:id', ...customerAuth, supportController.getTicketById);
router.post('/support/tickets/:id/messages', ...customerAuth, supportController.addTicketMessage);
router.get('/support/ticket-types', ...customerAuth, supportController.getActiveTicketTypes);

// Wallet routes (protected)
router.get('/wallet', ...customerAuth, walletController.getCustomerWallet);
router.get('/wallet/transactions', ...customerAuth, walletController.getCustomerWalletTransactions);
router.post('/wallet/pay', ...customerAuth, walletController.payWithWallet);

// Recently Viewed routes (protected)
router.get('/recently-viewed', ...customerAuth, recentlyViewedController.getRecentlyViewed);
router.post('/recently-viewed', ...customerAuth, recentlyViewedController.recordRecentlyViewed);

// User Homepage Personalized Route
router.get('/homepage', ...customerAuth, (req, res, next) => {
    // Dynamically resolve user homepage data
    import('../../../modules/admin/controllers/homepage.controller.js')
        .then((m) => m.getUserHomepage(req, res, next))
        .catch(next);
});

export default router;
