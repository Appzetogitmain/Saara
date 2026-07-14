import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as productController from '../controllers/product.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as customerController from '../controllers/customer.controller.js';
import * as inventoryController from '../controllers/inventory.controller.js';
import * as performanceController from '../controllers/performance.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as documentController from '../controllers/document.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as shippingController from '../controllers/shipping.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as walletController from '../controllers/wallet.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as brandController from '../controllers/brand.controller.js';
import * as categoryController from '../controllers/category.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import {
    registerSchema,
    loginSchema,
    verifyOtpSchema,
    resendOtpSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema
} from '../validators/auth.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    productIdParamSchema,
} from '../validators/product.validator.js';
import { uploadSingle, uploadMultiple, uploadDocumentSingle } from '../../../middlewares/upload.js';

const router = Router();
const vendorAuth = [authenticate, authorize('vendor'), enforceAccountStatus];

// Auth
router.post('/auth/register', authLimiter, validate(registerSchema), authController.register);
router.post('/auth/verify-otp', otpVerifyLimiter, validate(verifyOtpSchema), authController.verifyOTP);
router.post('/auth/resend-otp', otpLimiter, validate(resendOtpSchema), authController.resendOTP);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...vendorAuth, authController.getProfile);
router.put('/auth/profile', ...vendorAuth, authController.updateProfile);
router.put('/auth/bank-details', ...vendorAuth, authController.updateBankDetails);

// Products
router.get('/products', ...vendorAuth, productController.getVendorProducts);
router.get('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), productController.getVendorProductById);
router.post('/products', ...vendorAuth, validate(createProductSchema), productController.createProduct);
router.put('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), validate(updateProductSchema), productController.updateProduct);
router.delete('/products/:id', ...vendorAuth, validate(productIdParamSchema, 'params'), productController.deleteProduct);
router.patch('/stock/:productId', ...vendorAuth, productController.updateStock);

// Brands
router.get('/brands', ...vendorAuth, brandController.getVendorBrands);
router.get('/brand-requests', ...vendorAuth, brandController.getVendorBrandRequests);
router.post('/brand-requests', ...vendorAuth, brandController.requestVendorBrand);
router.put('/brand-requests/:id/resubmit', ...vendorAuth, brandController.resubmitVendorBrandRequest);

// Categories
router.get('/category-requests', ...vendorAuth, categoryController.getVendorCategoryRequests);
router.post('/category-requests', ...vendorAuth, categoryController.requestVendorCategory);
router.put('/category-requests/:id/resubmit', ...vendorAuth, categoryController.resubmitVendorCategoryRequest);

// Orders
router.get('/orders', ...vendorAuth, orderController.getVendorOrders);
router.get('/orders/:id', ...vendorAuth, orderController.getVendorOrderById);
router.patch('/orders/:id/status', ...vendorAuth, orderController.updateOrderStatus);
router.post('/orders/:id/verify-pickup', ...vendorAuth, orderController.verifyPickup);

// Customers
router.get('/customers', ...vendorAuth, customerController.getVendorCustomers);
router.get('/customers/:id', ...vendorAuth, customerController.getVendorCustomerById);

// Documents
router.get('/documents', ...vendorAuth, documentController.getVendorDocuments);
router.post('/documents', ...vendorAuth, uploadDocumentSingle('file'), documentController.createVendorDocument);
router.delete('/documents/:id', ...vendorAuth, documentController.deleteVendorDocument);

// Notifications
router.get('/notifications', ...vendorAuth, notificationController.getVendorNotifications);
router.put('/notifications/:id/read', ...vendorAuth, notificationController.markVendorNotificationAsRead);
router.put('/notifications/read-all', ...vendorAuth, notificationController.markAllVendorNotificationsAsRead);
router.delete('/notifications/:id', ...vendorAuth, notificationController.deleteVendorNotification);

// Inventory reports
router.get('/inventory/reports', ...vendorAuth, inventoryController.getInventoryReport);

// Performance metrics
router.get('/performance/metrics', ...vendorAuth, performanceController.getPerformanceMetrics);

// Analytics
router.get('/analytics/overview', ...vendorAuth, analyticsController.getAnalyticsOverview);

// Wallet & Earnings
router.get('/wallet/stats', ...vendorAuth, walletController.getWalletStats);
router.get('/wallet/history', ...vendorAuth, walletController.getTransactionHistory);
router.post('/wallet/withdraw', ...vendorAuth, walletController.requestWithdrawal);
router.get('/earnings', ...vendorAuth, orderController.getEarnings);

// Support Tickets
router.get('/support/ticket-types', ...vendorAuth, supportController.getTicketTypes);
router.get('/support/tickets', ...vendorAuth, supportController.getMyTickets);
router.post('/support/tickets', ...vendorAuth, supportController.createTicket);
router.post('/support/tickets/:id/message', ...vendorAuth, supportController.replyToTicket);

// Return requests
router.get('/return-requests', ...vendorAuth, returnController.getVendorReturnRequests);
router.get('/return-requests/:id', ...vendorAuth, returnController.getVendorReturnRequestById);
router.patch('/return-requests/:id/status', ...vendorAuth, returnController.updateVendorReturnRequestStatus);
router.post('/return-requests/:id/verify-handoff-otp', ...vendorAuth, returnController.verifyHandoffOtp);

// Product reviews
router.get('/reviews', ...vendorAuth, reviewController.getVendorReviews);
router.patch('/reviews/:id/status', ...vendorAuth, reviewController.updateVendorReviewStatus);
router.patch('/reviews/:id/response', ...vendorAuth, reviewController.addVendorReviewResponse);



// Shipping management
router.get('/shipping/zones', ...vendorAuth, shippingController.getShippingZones);
router.post('/shipping/zones', ...vendorAuth, shippingController.createShippingZone);
router.put('/shipping/zones/:id', ...vendorAuth, shippingController.updateShippingZone);
router.delete('/shipping/zones/:id', ...vendorAuth, shippingController.deleteShippingZone);
router.get('/shipping/rates', ...vendorAuth, shippingController.getShippingRates);
router.post('/shipping/rates', ...vendorAuth, shippingController.createShippingRate);
router.put('/shipping/rates/:id', ...vendorAuth, shippingController.updateShippingRate);
router.delete('/shipping/rates/:id', ...vendorAuth, shippingController.deleteShippingRate);

// Uploads (Cloudinary via temp local multer upload)
router.post('/uploads/image', ...vendorAuth, uploadSingle('image'), uploadController.uploadImage);
router.post('/uploads/images', ...vendorAuth, uploadMultiple('images', 8), uploadController.uploadImages);

export default router;
