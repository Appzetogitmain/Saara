import express from 'express';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import {
    initializePayment,
    retryPayment,
    exchangeUpgradePayment,
    verifyPayment,
} from '../controllers/payment.controller.js';

const router = express.Router();

const customerAuth = [authenticate, authorize('customer'), enforceAccountStatus];

// POST /api/user/payment/initialize — create order + Razorpay order
router.post('/initialize', ...customerAuth, initializePayment);

// POST /api/user/payment/verify — verify Razorpay payment
router.post('/verify', ...customerAuth, verifyPayment);

// POST /api/user/payment/retry/:orderId — retry after failed attempt
router.post('/retry/:orderId', ...customerAuth, retryPayment);


// POST /api/user/payment/exchange-upgrade/:returnRequestId
router.post('/exchange-upgrade/:returnRequestId', ...customerAuth, exchangeUpgradePayment);

export default router;
