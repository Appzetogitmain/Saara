import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as payoutController from '../controllers/payout.controller.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter, otpVerifyLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadDeliveryDocuments, uploadMultiple } from '../../../middlewares/upload.js';
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    verifyResetOtpSchema,
    resetPasswordSchema,
    refreshTokenSchema,
    logoutSchema,
} from '../validators/auth.validator.js';

const router = Router();
const deliveryAuth = [authenticate, authorize('delivery'), enforceAccountStatus];
const IS_PRODUCTION = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Auth
router.post(
    '/auth/register',
    authLimiter,
    uploadDeliveryDocuments([
        { name: 'drivingLicense', maxCount: 1 },
        { name: 'aadharCard', maxCount: 1 },
    ]),
    validate(registerSchema),
    authController.register
);
router.post('/auth/forgot-password', authLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/auth/verify-reset-otp', otpVerifyLimiter, validate(verifyResetOtpSchema), authController.verifyResetOTP);
router.post('/auth/reset-password', authLimiter, validate(resetPasswordSchema), authController.resetPassword);
router.post('/auth/login', authLimiter, validate(loginSchema), authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...deliveryAuth, authController.getProfile);
router.put('/auth/profile', ...deliveryAuth, authController.updateProfile);

// Orders
router.get('/orders', ...deliveryAuth, orderController.getAssignedOrders);
router.get('/orders/dashboard-summary', ...deliveryAuth, orderController.getDashboardSummary);
router.get('/orders/profile-summary', ...deliveryAuth, orderController.getProfileSummary);
router.get('/orders/:id', ...deliveryAuth, orderController.getOrderDetail);
// T1.5: Require an explicit opt-in flag to activate the debug OTP endpoint.
// NODE_ENV alone is unreliable (staging/CI may not set it to 'production').
// This route must NEVER be active in production — add ENABLE_DEBUG_OTP=true to .env only in local dev.
if (process.env.ENABLE_DEBUG_OTP === 'true') {
    router.get('/orders/:id/debug-otp', ...deliveryAuth, orderController.getDeliveryOtpForDebug);
}
router.patch('/orders/:id/status', ...deliveryAuth, orderController.updateDeliveryStatus);
router.post('/orders/:id/resend-delivery-otp', ...deliveryAuth, orderController.resendDeliveryOtp);
router.post('/orders/:id/accept', ...deliveryAuth, orderController.acceptOrder);
router.post('/orders/:id/reject', ...deliveryAuth, orderController.rejectOrder);

// Returns
router.get('/returns', ...deliveryAuth, returnController.getAssignedReturnPickups);
router.get('/returns/:id', ...deliveryAuth, returnController.getReturnPickupDetail);
router.post('/returns/:id/accept', ...deliveryAuth, returnController.acceptReturnPickup);
router.post('/returns/:id/reject', ...deliveryAuth, returnController.rejectReturnPickup);
router.post('/returns/:id/verify-otp', ...deliveryAuth, returnController.verifyCustomerPickupOtp);
router.post('/returns/:id/verify-vendor-handover-otp', ...deliveryAuth, returnController.verifyVendorHandoverOtp);
router.post('/returns/:id/verify-customer-delivery-otp', ...deliveryAuth, returnController.verifyCustomerDeliveryOtp);
router.patch('/returns/:id/status', ...deliveryAuth, uploadMultiple('photos', 5), returnController.updateReturnPickupStatus);

// Location tracking
router.patch('/location', ...deliveryAuth, orderController.updateLocation);

// Notifications
router.get('/notifications', ...deliveryAuth, notificationController.getDeliveryNotifications);
router.put('/notifications/:id/read', ...deliveryAuth, notificationController.markDeliveryNotificationAsRead);
router.put('/notifications/read-all', ...deliveryAuth, notificationController.markAllDeliveryNotificationsAsRead);
router.delete('/notifications/:id', ...deliveryAuth, notificationController.deleteDeliveryNotification);

// Support Desk
router.get('/support/ticket-types', ...deliveryAuth, supportController.getTicketTypes);
router.get('/support/tickets', ...deliveryAuth, supportController.getMyTickets);
router.post('/support/tickets', ...deliveryAuth, supportController.createTicket);
router.post('/support/tickets/:id/message', ...deliveryAuth, supportController.replyToTicket);

// Wallet & Payouts
router.get('/wallet/summary', ...deliveryAuth, payoutController.getWalletSummary);
router.post('/wallet/withdraw', ...deliveryAuth, payoutController.requestWithdrawal);
router.put('/wallet/payout-settings', ...deliveryAuth, payoutController.updatePayoutSettings);
router.get('/wallet/transactions', ...deliveryAuth, payoutController.getWalletTransactions);
router.get('/wallet/company-payment-details', ...deliveryAuth, payoutController.getCompanyPaymentDetails);

export default router;
