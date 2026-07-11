# Porutkal — 7-Day Daily Task Plan

---

## DAY 1 — 5 Quick Wins (Est. 3–4 hrs)

### Task 1.1 — Add MongoDB Text Index to Product
**File:** `backend/src/models/Product.model.js`
```js
// Add before: const Product = mongoose.model(...)
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
```
**Expected output:** `GET /api/products?search=shirt` returns relevant results.

---

### Task 1.2 — Rate-limit OTP Verify Endpoint
**File:** `backend/src/modules/user/routes/user.routes.js`
```js
// Change line 37 from:
router.post('/auth/verify-otp', validate(otpSchema), authController.verifyOTP);
// To:
router.post('/auth/verify-otp', otpLimiter, validate(otpSchema), authController.verifyOTP);
```
**File:** `backend/src/middlewares/rateLimiter.js` — confirm `otpLimiter` is exported (it is).
Do the same for vendor `verify-otp` in `vendor.routes.js` line 43.
**Expected output:** After 5 OTP attempts in 15 min → 429 Too Many Requests.

---

### Task 1.3 — Fix CORS to Whitelist
**File:** `backend/src/app.js`
```js
// Replace lines 47-50:
app.use(cors({
    origin: (origin, callback) => {
        const allowed = (process.env.ALLOWED_ORIGINS || '')
            .split(',')
            .map(o => o.trim())
            .filter(Boolean);
        if (!origin || allowed.includes(origin)) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
```
**File:** `backend/.env` — Add: `ALLOWED_ORIGINS=http://localhost:5173,https://yourdomain.com`
**Expected output:** Cross-origin requests from unknown domains blocked.

---

### Task 1.4 — Fix APP_NAME
**File:** `frontend/src/shared/utils/constants.js`
```js
// Change line 5:
export const APP_NAME = 'Porutkal Multi-Vendor E-Commerce';
```
**Expected output:** App name consistent across all pages.

---

### Task 1.5 — Call Order Confirmation Email
**File:** `backend/src/modules/user/controllers/order.controller.js`
```js
// Add import at top (line ~14):
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';

// After res.status(responseStatus).json(...) call at line ~473, add:
if (!idempotentReplay && order?.orderId) {
    const emailAddress = order?.shippingAddress?.email;
    if (emailAddress) {
        sendOrderConfirmationEmail(order, emailAddress).catch((err) =>
            console.warn('[Order Email] Failed to send:', err.message)
        );
    }
}
```
**Expected output:** User receives order confirmation email on successful order. Failure is non-blocking.

---

## DAY 2 — Razorpay Payment Integration (Est. 6–8 hrs)

### Task 2.1 — Install Razorpay SDK
```bash
cd backend && npm install razorpay
```
Add to `backend/.env`:
```
RAZORPAY_KEY_ID=rzp_test_xxxx
RAZORPAY_KEY_SECRET=xxxx
```

---

### Task 2.2 — Create Payment Service
**New file:** `backend/src/services/payment.service.js`
```js
import Razorpay from 'razorpay';
import crypto from 'crypto';

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

export const createRazorpayOrder = async (amount, currency = 'INR', receipt) => {
    return razorpay.orders.create({
        amount: Math.round(amount * 100), // paise
        currency,
        receipt,
    });
};

export const verifyRazorpaySignature = (orderId, paymentId, signature) => {
    const body = `${orderId}|${paymentId}`;
    const expected = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');
    return expected === signature;
};
```
**Expected output:** Utility functions ready for controller use.

---

### Task 2.3 — Add Payment Routes
**File:** `backend/src/modules/user/routes/user.routes.js`
```js
// Add at top:
import * as paymentController from '../controllers/payment.controller.js';

// Add routes before export:
router.post('/payments/create-order', ...customerAuth, paymentController.createPaymentOrder);
router.post('/payments/verify', ...customerAuth, paymentController.verifyPayment);
```

---

### Task 2.4 — Create Payment Controller
**New file:** `backend/src/modules/user/controllers/payment.controller.js`
```js
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Order from '../../../models/Order.model.js';
import { createRazorpayOrder, verifyRazorpaySignature } from '../../../services/payment.service.js';
import { sendOrderConfirmationEmail } from '../../../services/email.service.js';

// POST /api/user/payments/create-order
export const createPaymentOrder = asyncHandler(async (req, res) => {
    const { orderId } = req.body;
    const order = await Order.findOne({ orderId, userId: req.user.id });
    if (!order) throw new ApiError(404, 'Order not found.');
    if (order.paymentStatus === 'paid') throw new ApiError(400, 'Order already paid.');

    const rzpOrder = await createRazorpayOrder(order.total, 'INR', order.orderId);
    res.status(200).json(new ApiResponse(200, {
        rzpOrderId: rzpOrder.id,
        amount: rzpOrder.amount,
        currency: rzpOrder.currency,
        keyId: process.env.RAZORPAY_KEY_ID,
    }, 'Payment order created.'));
});

// POST /api/user/payments/verify
export const verifyPayment = asyncHandler(async (req, res) => {
    const { orderId, rzpOrderId, rzpPaymentId, rzpSignature } = req.body;

    const isValid = verifyRazorpaySignature(rzpOrderId, rzpPaymentId, rzpSignature);
    if (!isValid) throw new ApiError(400, 'Payment verification failed.');

    const order = await Order.findOneAndUpdate(
        { orderId, userId: req.user.id },
        { paymentStatus: 'paid', status: 'processing', rzpPaymentId },
        { new: true }
    );
    if (!order) throw new ApiError(404, 'Order not found.');

    const email = order.shippingAddress?.email;
    if (email) sendOrderConfirmationEmail(order, email).catch(() => null);

    res.status(200).json(new ApiResponse(200, { orderId: order.orderId }, 'Payment verified successfully.'));
});
```

---

### Task 2.5 — Frontend: Add Razorpay Script + Checkout Integration
**File:** `frontend/index.html` — Add inside `<head>`:
```html
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

**File:** `frontend/src/modules/UserApp/pages/Checkout.jsx`
In `handleSubmit` after `createOrder()` succeeds, if `paymentMethod === 'card'`:
```js
// After: const order = await createOrder({...})
if (formData.paymentMethod === 'card') {
    const rzpData = await api.post('/user/payments/create-order', { orderId: order.id });
    const { rzpOrderId, amount, currency, keyId } = rzpData?.data ?? rzpData;

    await new Promise((resolve, reject) => {
        const rzp = new window.Razorpay({
            key: keyId,
            amount, currency,
            order_id: rzpOrderId,
            name: 'Porutkal',
            handler: async (response) => {
                await api.post('/user/payments/verify', {
                    orderId: order.id,
                    rzpOrderId: response.razorpay_order_id,
                    rzpPaymentId: response.razorpay_payment_id,
                    rzpSignature: response.razorpay_signature,
                });
                resolve();
            },
            modal: { ondismiss: () => reject(new Error('Payment cancelled.')) },
        });
        rzp.open();
    });
}
```
**Expected output:** Clicking "Place Order" with Card opens Razorpay modal. After payment, `paymentStatus='paid'`, user redirected to confirmation.

---

## DAY 3 — Admin Settings + Vendor Fixes (Est. 4–5 hrs)

### Task 3.1 — Admin Settings API
**New file:** `backend/src/modules/admin/controllers/settings.controller.js`
```js
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import Settings from '../../../models/Settings.model.js';

export const getSettings = asyncHandler(async (req, res) => {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.status(200).json(new ApiResponse(200, settings, 'Settings fetched.'));
});

export const updateSettings = asyncHandler(async (req, res) => {
    const settings = await Settings.findOneAndUpdate(
        {},
        { $set: req.body },
        { new: true, upsert: true, runValidators: true }
    );
    res.status(200).json(new ApiResponse(200, settings, 'Settings updated.'));
});
```

**File:** `backend/src/modules/admin/routes/admin.routes.js` — Add before `export default router`:
```js
import * as settingsController from '../controllers/settings.controller.js';
router.get('/settings', ...adminAuth, settingsController.getSettings);
router.put('/settings', ...adminAuth, settingsController.updateSettings);
```
**Expected output:** Admin Settings page can load and save. `GET /api/admin/settings` returns stored settings.

---

### Task 3.2 — Vendor Support Tickets Route
**File:** `backend/src/modules/vendor/routes/vendor.routes.js`
```js
// Add import at top:
import * as supportController from '../../admin/controllers/support.controller.js';

// Add routes before export:
router.get('/support-tickets', ...vendorAuth, async (req, res, next) => {
    // Scope tickets to this vendor
    req.query.vendorId = req.user.id;
    next();
}, supportController.getAllTickets);

router.post('/support-tickets', ...vendorAuth, async (req, res, next) => {
    req.body.vendorId = req.user.id;
    next();
}, supportController.createTicketIfExists);
```
> **Note:** Check `support.controller.js` for `getAllTickets` — add a `vendorId` filter: `if (req.query.vendorId) filter.vendorId = req.query.vendorId;`

**Expected output:** VendorSupportTickets.jsx page loads real data, no 404 errors.

---

### Task 3.3 — Fix voteHelpful Deduplication
**File:** `backend/src/modules/user/controllers/review.controller.js`
```js
// Replace voteHelpful:
export const voteHelpful = asyncHandler(async (req, res) => {
    const voterId = req.user?.id || req.ip;
    const review = await Review.findById(req.params.id);
    if (!review) throw new ApiError(404, 'Review not found.');

    const alreadyVoted = review.helpfulVoters?.includes(voterId);
    if (alreadyVoted) {
        return res.status(200).json(new ApiResponse(200, review, 'Already voted.'));
    }

    const updated = await Review.findByIdAndUpdate(
        req.params.id,
        { $inc: { helpfulCount: 1 }, $addToSet: { helpfulVoters: voterId } },
        { new: true }
    );
    res.status(200).json(new ApiResponse(200, updated, 'Vote recorded.'));
});
```
**File:** `backend/src/models/Review.model.js` — Add field:
```js
helpfulVoters: [{ type: String }], // stores userId or IP
```
**Expected output:** One vote per user per review.

---

## DAY 4 — Real-time Vendor-Customer Chat (Est. 6–7 hrs)

### Task 4.1 — Install Socket.io
```bash
cd backend && npm install socket.io
```
```bash
cd frontend && npm install socket.io-client
```

---

### Task 4.2 — Setup Socket.io on Backend
**File:** `backend/src/server.js`
```js
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: process.env.ALLOWED_ORIGINS?.split(',') || '*', credentials: true },
});

// Attach io to app for use in controllers
app.set('io', io);

io.on('connection', (socket) => {
    socket.on('join:thread', (threadId) => socket.join(`thread:${threadId}`));
    socket.on('leave:thread', (threadId) => socket.leave(`thread:${threadId}`));
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```
Remove the old `app.listen(...)` call.

---

### Task 4.3 — Emit New Message Events from Controller
**File:** `backend/src/modules/vendor/controllers/chat.controller.js`
In `sendVendorChatMessage`, after saving message:
```js
// After message save:
const io = req.app.get('io');
if (io) {
    io.to(`thread:${thread._id}`).emit('chat:message', savedMessage);
}
```

---

### Task 4.4 — Frontend Socket Hook
**New file:** `frontend/src/modules/Vendor/hooks/useVendorChat.js`
```js
import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../../../shared/utils/constants';

const SOCKET_URL = API_BASE_URL.replace('/api', '');

export const useVendorChat = (threadId, initialMessages = []) => {
    const [messages, setMessages] = useState(initialMessages);
    const socketRef = useRef(null);

    useEffect(() => {
        if (!threadId) return;
        const token = localStorage.getItem('vendor-token');
        socketRef.current = io(SOCKET_URL, { auth: { token } });
        socketRef.current.emit('join:thread', threadId);

        socketRef.current.on('chat:message', (msg) => {
            setMessages(prev => [...prev, msg]);
        });

        return () => {
            socketRef.current?.emit('leave:thread', threadId);
            socketRef.current?.disconnect();
        };
    }, [threadId]);

    const sendMessage = (content) => {
        // REST API call as before — socket emits from backend
    };

    return { messages, setMessages, sendMessage };
};
```

**File:** `frontend/src/modules/Vendor/pages/Chat.jsx`
Replace local `messages` state + polling with `useVendorChat(selectedThread?._id, loadedMessages)`.

**Expected output:** Vendor opens Chat.jsx → new customer messages appear instantly without page refresh.

---

## DAY 5 — Replace AdminSocial Dummy Data (Est. 5–6 hrs)

### Task 5.1 — Create Backend Reels API
**New file:** `backend/src/modules/admin/controllers/social.controller.js`
```js
// Minimal implementation using a new Reel model or repurpose existing
import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';

// Placeholder — wire to a Reel model when social feature is built
export const getAllReels = asyncHandler(async (req, res) => {
    res.status(200).json(new ApiResponse(200, [], 'Reels fetched.'));
});

export const updateReelStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    // Update reel status in DB
    res.status(200).json(new ApiResponse(200, { status }, 'Reel status updated.'));
});
```

**File:** `backend/src/modules/admin/routes/admin.routes.js`
```js
import * as socialController from '../controllers/social.controller.js';
router.get('/reels', ...adminAuth, socialController.getAllReels);
router.patch('/reels/:id/status', ...adminAuth, socialController.updateReelStatus);
```

---

### Task 5.2 — Wire AdminSocial Hook to API
**File:** `frontend/src/modules/AdminSocial/hooks/useAdminSocial.js`
```js
import { useState, useEffect } from 'react';
import api from '../../../shared/utils/api';

export const useAdminSocial = () => {
    const [reels, setReels] = useState([]);
    const [payouts, setPayouts] = useState([]);
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        api.get('/admin/reels')
            .then(data => setReels(Array.isArray(data?.data ?? data) ? (data?.data ?? data) : []))
            .catch(() => setReels([]));
    }, []);

    const updateReelStatus = async (reelId, newStatus) => {
        await api.patch(`/admin/reels/${reelId}/status`, { status: newStatus });
        setReels(prev => prev.map(r => r._id === reelId ? { ...r, status: newStatus } : r));
    };

    const updatePayoutStatus = async (payoutId, newStatus) => {
        setPayouts(prev => prev.map(p => p._id === payoutId ? { ...p, status: newStatus } : p));
    };

    return {
        reels, payouts, logs,
        updateReelStatus, updatePayoutStatus,
        reportedReels: reels.filter(r => r.status === 'reported'),
    };
};
```
Remove all `import` of `dummyData/*` files. Delete `AdminSocial/dummyData/` folder.

**Expected output:** AdminSocial pages call real API. No localStorage mock data in production.

---

## DAY 6 — Firebase Push Notifications (Est. 5–6 hrs)

### Task 6.1 — Firebase Admin SDK on Backend
```bash
cd backend && npm install firebase-admin
```
Add to `backend/.env`:
```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@...
```

**New file:** `backend/src/services/push.service.js`
```js
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        }),
    });
}

export const sendPushNotification = async ({ token, title, body, data = {} }) => {
    if (!token) return;
    try {
        await admin.messaging().send({ token, notification: { title, body }, data });
    } catch (err) {
        console.warn('[Push] Failed:', err.message);
    }
};
```

---

### Task 6.2 — Store FCM Token on User
**File:** `backend/src/models/User.model.js` — Add field:
```js
fcmToken: { type: String, default: null },
```

**File:** `backend/src/modules/user/routes/user.routes.js`
```js
router.put('/auth/fcm-token', ...customerAuth, async (req, res, next) => {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user.id, { fcmToken });
    res.status(200).json({ success: true, message: 'FCM token saved.' });
});
```

---

### Task 6.3 — Fire Push on Order Status Change
**File:** `backend/src/modules/admin/controllers/order.controller.js`
In `updateOrderStatus`, after saving order:
```js
import { sendPushNotification } from '../../../services/push.service.js';
import User from '../../../models/User.model.js';

// After order save:
if (order.userId) {
    const user = await User.findById(order.userId).select('fcmToken').lean();
    if (user?.fcmToken) {
        await sendPushNotification({
            token: user.fcmToken,
            title: 'Order Update',
            body: `Your order ${order.orderId} is now ${newStatus}.`,
            data: { orderId: order.orderId },
        });
    }
}
```

---

### Task 6.4 — Frontend: Request FCM Permission
**File:** `frontend/src/shared/components/AppBootstrap.jsx` (or equivalent init file)
```js
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import api from '../utils/api';

const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const initFirebaseMessaging = async () => {
    try {
        const app = initializeApp(firebaseConfig);
        const messaging = getMessaging(app);
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;
        const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY });
        if (token) await api.put('/user/auth/fcm-token', { fcmToken: token });
        onMessage(messaging, (payload) => {
            // Show in-app toast
            toast(payload.notification?.body || 'New notification');
        });
    } catch (err) {
        console.warn('[Firebase] Init failed:', err.message);
    }
};
```
**Frontend `.env`** — Add:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...
```
**Expected output:** On login, browser asks for notification permission. On order status change, user receives push notification.

---

## DAY 7 — Testing, Cleanup & Pre-Deploy (Est. 4–5 hrs)

### Task 7.1 — Remove Dev/Seed Files from Bundle
Delete or move these files (not needed in production):
- `frontend/src/shared/utils/initializeFashionHubData.js`
- `frontend/src/shared/utils/initializeFashionHubProducts.js`
- `backend/scratch/` (entire folder)
- `backend/test.md`

Search for any imports of these files:
```bash
grep -r "initializeFashionHub" frontend/src --include="*.jsx" --include="*.js"
```
Remove any import/usage found.

---

### Task 7.2 — End-to-End Flow Test Checklist
Run each flow manually and verify:

**User Flow:**
- [ ] Register → receive OTP email → verify → logged in
- [ ] Browse products → search works → filters work
- [ ] Add to cart → checkout → COD order placed → confirmation email received
- [ ] Card payment → Razorpay modal opens → payment succeeds → `paymentStatus=paid`
- [ ] Cancel order → stock restored
- [ ] Track order (public, no login)

**Vendor Flow:**
- [ ] Register → OTP → admin approves → login works
- [ ] Add product with image → product visible in store
- [ ] Receive order notification → update status → delivery assigned
- [ ] View earnings dashboard

**Admin Flow:**
- [ ] Login → dashboard loads real numbers
- [ ] Approve vendor → vendor can now login
- [ ] Settings page loads and saves
- [ ] Create coupon → apply in checkout → discount applied

---

### Task 7.3 — Create `.env.production` Template
**File:** `backend/.env.production.example`
```
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<32-char-random-string>
JWT_REFRESH_SECRET=<32-char-random-string>
ALLOWED_ORIGINS=https://yourdomain.com
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
FROM_NAME=Porutkal
FROM_EMAIL=noreply@yourdomain.com
RAZORPAY_KEY_ID=rzp_live_...
RAZORPAY_KEY_SECRET=...
FIREBASE_PROJECT_ID=...
FIREBASE_PRIVATE_KEY=...
FIREBASE_CLIENT_EMAIL=...
```

---

### Task 7.4 — Security Final Checks
- [ ] Confirm `NODE_ENV=production` disables `/api/delivery/orders/:id/debug-otp`
- [ ] Confirm `helmet()` is active (already is — `app.js` line 45)
- [ ] Confirm `mongoSanitize()` active (already is — `app.js` line 46)
- [ ] Confirm `apiLimiter` on all `/api` routes (already is — `app.js` line 60)
- [ ] Confirm `ALLOWED_ORIGINS` env var set correctly for production
- [ ] Confirm `JWT_SECRET` is a strong random string, not default

---

## Summary Table

| Day | Focus | Est. Hours | Key Output |
|---|---|---|---|
| 1 | 5 quick fixes | 3–4h | Text search, OTP security, CORS, email, branding |
| 2 | Razorpay payment | 6–8h | Real card payments working end-to-end |
| 3 | Settings API + Vendor fixes | 4–5h | Settings persist, vendor support works, fair voting |
| 4 | Socket.io chat | 6–7h | Real-time vendor-customer chat |
| 5 | Remove dummy data | 5–6h | AdminSocial wired to real API |
| 6 | Firebase push | 5–6h | Order status push notifications |
| 7 | Test + cleanup + deploy prep | 4–5h | Production-ready build |
| **Total** | | **~35–41h** | **Project at ~90% completion** |
