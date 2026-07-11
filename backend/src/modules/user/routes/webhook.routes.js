import express from 'express';
import { handleRazorpayWebhook } from '../controllers/webhook.controller.js';

const router = express.Router();

// POST /api/webhook/razorpay
// No auth — verified by Razorpay signature
// express.raw() is applied at app.js level before this router
router.post('/razorpay', handleRazorpayWebhook);

export default router;
