import express from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller.js';
import { handleShiprocketWebhook } from '../controllers/shiprocketWebhook.controller.js';
import { handleDelhiveryWebhook } from '../controllers/delhiveryWebhook.controller.js';

const router = express.Router();

// POST /api/webhook/razorpay
// No auth — verified by Razorpay signature
// express.raw() is applied at app.js level before this router
router.post('/razorpay', handleRazorpayWebhook);

// POST /api/webhook/shiprocket
// express.raw() is applied at app.js level
router.post('/shiprocket', handleShiprocketWebhook);

// POST /api/webhook/delhivery
// express.raw() is applied at app.js level
router.post('/delhivery', handleDelhiveryWebhook);

export default router;
