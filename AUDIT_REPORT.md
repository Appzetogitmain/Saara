# Porutkal Multi-Vendor E-Commerce â€” Full Code Audit

## STEP 1: PROJECT ARCHITECTURE

### Stack

- **Backend**: Node.js + Express.js (ESM modules), MongoDB + Mongoose, JWT auth, Cloudinary uploads, Nodemailer (SMTP)
- **Frontend**: React 18 + Vite, Zustand state management, Axios, Tailwind CSS, Framer Motion, Recharts
- **Architecture**: Monorepo with `/backend` and `/frontend` folders, modular controller/route pattern

### Backend Module Structure

```
src/
  app.js                 â† Express app, all routes mounted
  server.js              â† DB connect + server start
  routes/public.routes.jsâ† Unauthenticated product/catalog APIs
  modules/
    admin/               â† 14 controllers, 1 routes file
    vendor/              â† 14 controllers, 1 routes file
    user/                â† 6 controllers, 1 routes file
    delivery/            â† 3 controllers, 1 routes file
  models/                â† 32 Mongoose models
  middlewares/           â† authenticate, authorize, rateLimiter, upload, validate, cache, errorHandler
  services/              â† email, otp, notification, commission, stock, upload, shipping, refreshToken, reviewAggregate
  utils/                 â† asyncHandler, ApiError, ApiResponse, generateToken, generateOrderId, etc.
```

### Frontend Module Structure

```
src/
  App.jsx                â† All routes (777 lines), BrowserRouter
  modules/
    UserApp/             â† 29 pages, 1 store file (userNotificationStore)
    Vendor/              â† 27+5 pages, 4 store files, 1 service file
    Admin/               â† 21+17 pages, 3 store files
    Delivery/            â† 5 pages
    Reels/               â† 5 pages (dummy data)
    Affiliate/           â† 1 page (dummy data)
    VendorAffiliate/     â† 1 page (dummy data)
    WebsiteBuilder/      â† 2 pages (dummy data)
    AdminSocial/         â† 3 pages (100% dummy data, localStorage-based)
    Explore/             â† 1 page
  shared/
    store/               â† 20 Zustand stores (authStore, cartStore, orderStore, wishlistStore, etc.)
    utils/               â† api.js (Axios interceptors), helpers, constants, 2 seed scripts
```

### API Base URL

- Frontend `.env`: `VITE_API_BASE_URL=http://localhost:5000/api`
- Backend listens on `PORT` from env (default 5000)
- CORS: `origin: (origin, callback) => callback(null, true)` â€” **allows ALL origins**

---

## STEP 2: FEATURE AUDIT TABLES

### 2.1 â€” Authentication (User / Vendor / Admin / Delivery)

| Feature                                   | Status        | Evidence                                        | Issues                          | %    |
| ----------------------------------------- | ------------- | ----------------------------------------------- | ------------------------------- | ---- |
| User Register (email + OTP)               | âœ… Completed | `user/auth.controller.js` register + verifyOTP  | None                            | 100% |
| User Login (JWT access+refresh)           | âœ… Completed | `user/auth.controller.js` login, `authStore.js` | None                            | 100% |
| User Forgot/Reset Password (OTP)          | âœ… Completed | forgotPassword, verifyResetOTP, resetPassword   | None                            | 100% |
| User Token Refresh (rotation)             | âœ… Completed | `refreshToken.service.js`, `api.js` interceptor | None                            | 100% |
| User Logout (revoke refresh)              | âœ… Completed | clearRefreshSession                             | None                            | 100% |
| User Profile Update + Avatar (Cloudinary) | âœ… Completed | uploadProfileAvatar â†’ Cloudinary cleanup      | None                            | 100% |
| User Change Password                      | âœ… Completed | changePassword, invalidates refresh token       | None                            | 100% |
| Vendor Register (OTP + admin approval)    | âœ… Completed | `vendor/auth.controller.js`, status='pending'   | None                            | 100% |
| Vendor Login (status checks)              | âœ… Completed | pending/suspended/rejected blocks login         | None                            | 100% |
| Vendor Bank Details Update                | âœ… Completed | `PUT /vendor/auth/bank-details`                 | None                            | 100% |
| Admin Login (no register route)           | âœ… Completed | `admin/auth.controller.js`                      | Admin seeded manually           | 90%  |
| Delivery Boy Register (doc upload)        | âœ… Completed | uploadDeliveryDocuments middleware              | None                            | 100% |
| enforceAccountStatus middleware           | âœ… Completed | DB-check on every protected request             | Extra DB query/request          | 100% |
| OTP brute-force protection                | âš ï¸ Partial | `otpLimiter` on resend, NOT on verify-otp       | verify-otp has no attempt limit | 60%  |

### 2.2 â€” Product Management

| Feature                                            | Status        | Evidence                                                         | Issues                                         | %    |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------------- | ---------------------------------------------- | ---- |
| Public product listing (filters/sort/pagination)   | âœ… Completed | `public.routes.js` listProducts                                  | None                                           | 100% |
| Flash sale / New arrivals / Popular / Similar      | âœ… Completed | `/flash-sale`, `/new-arrivals`, `/popular`, `/similar/:id`       | None                                           | 100% |
| Campaign-based product exclusion from main listing | âœ… Completed | `getActiveSaleProductIds()` filtering                            | None                                           | 100% |
| Product detail (public)                            | âœ… Completed | `/products/:id`                                                  | None                                           | 100% |
| Variant price resolution (size/color/dynamic axes) | âœ… Completed | `resolveVariantSelection()` in order.controller                  | None                                           | 100% |
| Vendor: CRUD products                              | âœ… Completed | `vendor/product.controller.js`, 5 routes                         | None                                           | 100% |
| Vendor: Stock update                               | âœ… Completed | `PATCH /vendor/stock/:productId`                                 | None                                           | 100% |
| Admin: CRUD products                               | âœ… Completed | `admin/catalog.controller.js`                                    | None                                           | 100% |
| Admin: Tax/Pricing rules                           | âœ… Completed | getTaxPricingRules, updateTaxPricingRules                        | None                                           | 100% |
| Admin: ProductForm page                            | âš ï¸ Partial | `Admin/pages/ProductForm.jsx` (19 lines, wraps ProductFormModal) | Thin wrapper; depends on modal component       | 80%  |
| Search (text index)                                | âœ… Completed | `$text: { $search: searchQuery }` in listProducts                | No fuzzy/typo tolerance                        | 80%  |
| Search page (frontend)                             | âœ… Completed | `Search.jsx` (40 KB, large page)                                 | None                                           | 100% |
| Category/Brand filter                              | âœ… Completed | category hierarchical lookup + brand filter                      | None                                           | 100% |
| Price/Rating filters                               | âœ… Completed | minPrice, maxPrice, minRating query params                       | None                                           | 100% |
| Response caching (in-memory)                       | âœ… Completed | `cacheResponse` middleware, 30â€“300s TTL                        | Not shared across instances (single-node only) | 90%  |

### 2.3 â€” Cart System

| Feature                                     | Status        | Evidence                                          | Issues                                                            | %    |
| ------------------------------------------- | ------------- | ------------------------------------------------- | ----------------------------------------------------------------- | ---- |
| Add to cart (auth guard)                    | âœ… Completed | `useCartStore.addItem()` checks `isAuthenticated` | None                                                              | 100% |
| Cart line-key deduplication (variant-aware) | âœ… Completed | `getCartLineKey(id, variant)`                     | None                                                              | 100% |
| Quantity update / remove / clear            | âœ… Completed | updateQuantity, removeItem, clearCart             | None                                                              | 100% |
| Local stock guard                           | âœ… Completed | stockQuantity check in addItem                    | Client-side only; final check on backend                          | 90%  |
| Cart persisted to localStorage              | âœ… Completed | Zustand `persist` middleware                      | Cart survives refresh                                             | 100% |
| Cart cleared on logout                      | âœ… Completed | logout() removes `cart-storage`                   | None                                                              | 100% |
| Multi-user cart isolation                   | âœ… Completed | ownerUserId tracking, auto-clear on user switch   | None                                                              | 100% |
| Cart grouping by vendor                     | âœ… Completed | getItemsByVendor() in useStore                    | None                                                              | 100% |
| Cart drawer UI                              | âœ… Completed | `CartDrawer` in App.jsx                           | None                                                              | 100% |
| Cart animation trigger                      | âœ… Completed | useUIStore.triggerCartAnimation()                 | None                                                              | 100% |
| **No server-side cart**                     | âš ï¸ Gap     | Cart is 100% client-side (localStorage)           | Cross-device sync not possible; cart lost if localStorage cleared | 0%   |

### 2.4 â€” Order System

| Feature                                          | Status             | Evidence                                                              | Issues                                                                                 | %    |
| ------------------------------------------------ | ------------------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---- |
| Place order (authenticated)                      | âœ… Completed      | `user/order.controller.js` placeOrder                                 | Server-side pricing, stock deduction in transaction                                    | 100% |
| Atomic stock deduction (MongoDB session)         | âœ… Completed      | `session.withTransaction()`                                           | None                                                                                   | 100% |
| Idempotency key (duplicate prevention)           | âœ… Completed      | x-idempotency-key header + DB unique index                            | None                                                                                   | 100% |
| Commission recording                             | âœ… Completed      | Commission.insertMany in same transaction                             | None                                                                                   | 100% |
| Coupon usage increment                           | âœ… Completed      | Coupon.updateOne in transaction                                       | None                                                                                   | 100% |
| Tax calculation (18% hardcoded)                  | âš ï¸ Partial      | `tax = subtotal * 0.18`                                               | Tax rate is hardcoded, not configurable                                                | 60%  |
| Shipping calculation (vendor-based)              | âœ… Completed      | `vendorShipping.service.js`                                           | None                                                                                   | 100% |
| Get user orders + detail                         | âœ… Completed      | getUserOrders, getOrderDetail                                         | None                                                                                   | 100% |
| Cancel order (stock restore + commission cancel) | âœ… Completed      | cancelOrder with MongoDB session                                      | None                                                                                   | 100% |
| Return request creation                          | âœ… Completed      | createReturnRequest, vendor scoped                                    | None                                                                                   | 100% |
| Order tracking (public, no auth)                 | âœ… Completed      | `GET /api/orders/track/:id`                                           | None                                                                                   | 100% |
| Order confirmation page                          | âœ… Completed      | `/order-confirmation/:orderId` (React)                                | None                                                                                   | 100% |
| **Payment gateway integration**                  | âŒ Not Implemented | paymentMethod stored, paymentStatus='pending' always                  | Order comment: "Keep pending until gateway/webhook implemented" â€” no Razorpay/Stripe | 0%   |
| Order confirmation email                         | âŒ Not Implemented | `sendOrderConfirmationEmail` exists but is NEVER called in placeOrder | Function declared, never invoked                                                       | 5%   |
| Vendor order status update                       | âœ… Completed      | `PATCH /vendor/orders/:id/status`                                     | None                                                                                   | 100% |
| Admin order management + delivery assign         | âœ… Completed      | admin/order.controller.js                                             | None                                                                                   | 100% |
| Invoice page (admin)                             | âš ï¸ Partial      | `Admin/pages/orders/Invoice.jsx` exists                               | No backend PDF generation endpoint                                                     | 50%  |

### 2.5 â€” Payment Integration

| Feature                        | Status             | Evidence                              | Issues                                               | %   |
| ------------------------------ | ------------------ | ------------------------------------- | ---------------------------------------------------- | --- |
| COD (Cash on Delivery)         | âš ï¸ Partial      | paymentMethod='cash'â†’'cod' in model | No cash settlement flow for user-facing confirmation | 50% |
| Card payment (Razorpay/Stripe) | âŒ Not Implemented | UI shows "Credit/Debit Card" option   | No gateway SDK, no payment intent, no webhook        | 0%  |
| Bank transfer                  | âŒ Not Implemented | UI shows "Bank Transfer" option       | No backend verification logic                        | 0%  |
| UPI                            | âŒ Not Implemented | paymentMethod enum has 'upi'          | No UPI flow                                          | 0%  |
| Wallet payment                 | âŒ Not Implemented | paymentMethod enum has 'wallet'       | No wallet balance or deduction logic                 | 0%  |
| Payment webhook                | âŒ Not Implemented | No webhook route exists               | â€”                                                  | 0%  |
| Refund processing              | âš ï¸ Partial      | refundStatus field on ReturnRequest   | No actual refund API call to gateway                 | 10% |

### 2.6 â€” Vendor Dashboard

| Feature                                   | Status             | Evidence                                                   | Issues                                              | %    |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------- | --------------------------------------------------- | ---- |
| Vendor login/register/OTP/forgot-password | âœ… Completed      | All routes + pages present                                 | None                                                | 100% |
| Dashboard overview                        | âœ… Completed      | `Vendor/pages/Dashboard.jsx` + analytics API               | None                                                | 100% |
| Product CRUD (with images via Cloudinary) | âœ… Completed      | vendor/product.controller.js + upload routes               | None                                                | 100% |
| Stock management page                     | âœ… Completed      | StockManagement.jsx + inventoryController                  | None                                                | 100% |
| Order management (list + status update)   | âœ… Completed      | vendor/order.controller.js                                 | None                                                | 100% |
| Earnings / Commission view                | âœ… Completed      | getEarnings route + Earnings.jsx                           | None                                                | 100% |
| Customer view (per-vendor scoped)         | âœ… Completed      | vendor/customer.controller.js                              | None                                                | 100% |
| Vendor-customer chat (thread-based)       | âœ… Completed      | vendor/chat.controller.js, VendorChatThread/Message models | No real-time (Socket.io missing)                    | 70%  |
| Return request management                 | âœ… Completed      | vendor/return.controller.js                                | None                                                | 100% |
| Product reviews response                  | âœ… Completed      | vendor/review.controller.js                                | None                                                | 100% |
| Shipping zones + rates CRUD               | âœ… Completed      | vendor/shipping.controller.js                              | None                                                | 100% |
| Pickup locations                          | âœ… Completed      | PickupLocations.jsx â†’ backend PickupLocation model       | None                                                | 100% |
| Performance metrics                       | âœ… Completed      | vendor/performance.controller.js                           | None                                                | 100% |
| Vendor documents upload                   | âœ… Completed      | vendor/document.controller.js + uploadDocumentSingle       | None                                                | 100% |
| Support tickets view (vendor-side)        | âš ï¸ Partial      | SupportTickets.jsx page exists                             | No dedicated vendor support ticket API routes       | 40%  |
| Affiliate dashboard                       | âŒ Not Implemented | AffiliateDashboard.jsx uses dummy data                     | No backend                                          | 5%   |
| Website builder                           | âŒ Not Implemented | BuilderDashboard.jsx uses dummy data                       | No backend                                          | 5%   |
| Wallet history                            | âš ï¸ Partial      | WalletHistory.jsx page exists                              | No dedicated wallet API; data sourced from earnings | 40%  |

### 2.7 â€” Admin Panel

| Feature                                                          | Status             | Evidence                                           | Issues                                 | %    |
| ---------------------------------------------------------------- | ------------------ | -------------------------------------------------- | -------------------------------------- | ---- |
| Admin login                                                      | âœ… Completed      | admin/auth.controller.js                           | No self-registration (must seed)       | 90%  |
| Dashboard analytics (revenue, orders, users, vendors)            | âœ… Completed      | analytics.controller.js, 9 endpoints               | None                                   | 100% |
| Order management (list, detail, status, delete, assign delivery) | âœ… Completed      | admin/order.controller.js                          | None                                   | 100% |
| Product management (CRUD + tax rules)                            | âœ… Completed      | admin/catalog.controller.js                        | None                                   | 100% |
| Category management (CRUD + reorder)                             | âœ… Completed      | admin/catalog.controller.js                        | None                                   | 100% |
| Brand management (CRUD)                                          | âœ… Completed      | admin/catalog.controller.js                        | None                                   | 100% |
| Vendor management (list, approve/suspend, commission)            | âœ… Completed      | admin/vendor.controller.js                         | None                                   | 100% |
| Customer management (list, detail, status, orders)               | âœ… Completed      | admin/customer.controller.js                       | None                                   | 100% |
| Delivery boy management (CRUD, status, settle cash)              | âœ… Completed      | admin/delivery.controller.js                       | None                                   | 100% |
| Return requests (list, detail, status update)                    | âœ… Completed      | admin/return.controller.js                         | None                                   | 100% |
| Support ticket management                                        | âœ… Completed      | admin/support.controller.js                        | None                                   | 100% |
| Reviews management (approve/reject/delete)                       | âœ… Completed      | admin/review.controller.js                         | None                                   | 100% |
| Marketing: Coupons CRUD                                          | âœ… Completed      | admin/marketing.controller.js                      | None                                   | 100% |
| Marketing: Banners CRUD + reorder                                | âœ… Completed      | admin/marketing.controller.js                      | None                                   | 100% |
| Marketing: Campaigns CRUD                                        | âœ… Completed      | admin/marketing.controller.js                      | None                                   | 100% |
| Reports: Sales + Inventory                                       | âœ… Completed      | admin/report.controller.js                         | None                                   | 100% |
| Notifications                                                    | âœ… Completed      | admin/notification.controller.js                   | None                                   | 100% |
| Settings page                                                    | âš ï¸ Partial      | Settings.jsx â†’ Settings model exists             | No API endpoints to save/load settings | 30%  |
| Reel moderation                                                  | âŒ Not Implemented | AdminSocial/ReelModeration.jsx â€” 100% dummy data | No backend routes; localStorage-only   | 5%   |
| Affiliate payouts (admin)                                        | âŒ Not Implemented | AffiliatePayouts.jsx â€” 100% dummy data           | No backend                             | 5%   |
| Audit logs                                                       | âŒ Not Implemented | AuditLogs.jsx â€” 100% dummy data                  | No backend                             | 5%   |
| Finance sub-pages (ProfitLoss, OrderTrends, etc.)                | âš ï¸ Partial      | Pages exist, import from adminStore                | Limited data mapping to real APIs      | 50%  |
| Push/Firebase notifications                                      | âŒ Not Implemented | PushConfig.jsx / Authentication.jsx pages exist    | No Firebase SDK or backend integration | 5%   |

### 2.8 â€” Reviews & Ratings

| Feature                                  | Status        | Evidence                                   | Issues                                    | %    |
| ---------------------------------------- | ------------- | ------------------------------------------ | ----------------------------------------- | ---- |
| Submit review (purchase-verified)        | âœ… Completed | addReview checks order status='delivered'  | None                                      | 100% |
| Prevent duplicate review                 | âœ… Completed | findOne existing check                     | None                                      | 100% |
| List product reviews (paginated, sorted) | âœ… Completed | getProductReviews, isApproved filter       | None                                      | 100% |
| Vote helpful                             | âœ… Completed | voteHelpful, $inc helpfulCount             | No dedup (anyone can vote multiple times) | 70%  |
| Review approval (admin)                  | âœ… Completed | admin/review.controller.js                 | None                                      | 100% |
| Vendor review response                   | âœ… Completed | addVendorReviewResponse                    | None                                      | 100% |
| Review aggregate service                 | âœ… Completed | `reviewAggregate.service.js`               | Not auto-triggered on review approval     | 70%  |
| Rating shown on product card             | âœ… Completed | product.rating, product.reviewCount fields | None                                      | 100% |

### 2.9 â€” Search & Filters

| Feature                                   | Status             | Evidence                           | Issues                                                              | %    |
| ----------------------------------------- | ------------------ | ---------------------------------- | ------------------------------------------------------------------- | ---- |
| Text search (MongoDB $text)               | âœ… Completed      | `$text: { $search: searchQuery }`  | No text index defined in Product model (must be created separately) | 70%  |
| Category / Brand / Vendor filters         | âœ… Completed      | filter params in listProducts      | None                                                                | 100% |
| Price range filter                        | âœ… Completed      | minPrice, maxPrice                 | None                                                                | 100% |
| Min rating filter                         | âœ… Completed      | minRating filter                   | None                                                                | 100% |
| Sort (newest/oldest/price/popular/rating) | âœ… Completed      | sortMap in listProducts            | None                                                                | 100% |
| Pagination                                | âœ… Completed      | page, limit, total, pages returned | None                                                                | 100% |
| Frontend Search.jsx                       | âœ… Completed      | 40 KB page, complex filter UI      | None                                                                | 100% |
| Autocomplete / suggestions                | âŒ Not Implemented | No suggest/autocomplete endpoint   | â€”                                                                 | 0%   |

### 2.10 â€” Delivery Module

| Feature                                     | Status        | Evidence                                     | Issues | %    |
| ------------------------------------------- | ------------- | -------------------------------------------- | ------ | ---- |
| Delivery boy register (with doc upload)     | âœ… Completed | delivery/auth.controller.js                  | None   | 100% |
| Delivery boy login / auth                   | âœ… Completed | All auth routes present                      | None   | 100% |
| View assigned orders                        | âœ… Completed | getAssignedOrders                            | None   | 100% |
| Update delivery status (OTP-gated delivery) | âœ… Completed | updateDeliveryStatus + OTP verify            | None   | 100% |
| Resend delivery OTP                         | âœ… Completed | resendDeliveryOtp                            | None   | 100% |
| Dashboard / profile summary                 | âœ… Completed | getDashboardSummary, getProfileSummary       | None   | 100% |
| Debug OTP endpoint (dev only)               | âœ… Completed | getDeliveryOtpForDebug (non-production only) | None   | 100% |
| Notifications                               | âœ… Completed | delivery notification routes                 | None   | 100% |

---

## STEP 3: FLOW VALIDATION

### Flow 1: User â€” Register â†’ Login â†’ Browse â†’ Add to Cart â†’ Checkout â†’ Order

| Step                                        | Status        | Notes                                                                                                 |
| ------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| Register (email + password)                 | âœ… Works     | POST /api/user/auth/register                                                                          |
| OTP verification email                      | âœ… Works     | Nodemailer SMTP â€” requires SMTP env vars configured                                                 |
| Verify OTP â†’ auto-login                   | âœ… Works     | Returns accessToken + refreshToken                                                                    |
| Browse products (Home, Category, Search)    | âœ… Works     | All public routes live                                                                                |
| Product detail + variant selection          | âœ… Works     | ProductDetail.jsx (51 KB)                                                                             |
| Add to cart (auth-gated, localStorage)      | âœ… Works     | Cart persists, multi-variant aware                                                                    |
| Cart â†’ Checkout page (address + shipping) | âœ… Works     | Checkout.jsx (38 KB), saved address prefill                                                           |
| Coupon validation                           | âœ… Works     | POST /api/coupons/validate                                                                            |
| Shipping estimate (live API)                | âœ… Works     | POST /api/shipping/estimate                                                                           |
| **Place Order (COD)**                       | âš ï¸ Partial | Order created, paymentStatus stays 'pending' forever. COD works functionally but no confirmation flow |
| **Place Order (Card/Bank/UPI)**             | âŒ BROKEN     | No payment gateway. User selects card, order created with paymentStatus='pending', no charge happens  |
| Order confirmation page                     | âœ… Works     | /order-confirmation/:orderId                                                                          |
| Order list + detail                         | âœ… Works     | /orders and /orders/:orderId                                                                          |
| Cancel order                                | âœ… Works     | Stock auto-restored                                                                                   |
| Request return (delivered only)             | âœ… Works     | createReturnRequest                                                                                   |
| **Order confirmation email**                | âŒ BROKEN     | `sendOrderConfirmationEmail` is NEVER called in placeOrder                                            |

**Flow 1 verdict:** Works end-to-end **for COD only**. Card/Bank/UPI payment creates an order but charges nothing.

---

### Flow 2: Vendor â€” Register â†’ Add Products â†’ Manage Orders â†’ View Earnings

| Step                                     | Status        | Notes                                                                                                                                                 |
| ---------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register (storeName, email, address)     | âœ… Works     | Notifies admins via notification service                                                                                                              |
| Email OTP verification                   | âœ… Works     | Status stays 'pending' post-verify                                                                                                                    |
| Admin approves vendor                    | âœ… Works     | PATCH /api/admin/vendors/:id/status                                                                                                                   |
| Vendor login                             | âœ… Works     | Blocks pending/suspended/rejected                                                                                                                     |
| Add product (with images via Cloudinary) | âœ… Works     | POST /api/vendor/products                                                                                                                             |
| Manage stock                             | âœ… Works     | StockManagement.jsx + inventory API                                                                                                                   |
| View orders                              | âœ… Works     | GET /api/vendor/orders                                                                                                                                |
| Update order status                      | âœ… Works     | PATCH /api/vendor/orders/:id/status                                                                                                                   |
| View earnings / commissions              | âœ… Works     | GET /api/vendor/earnings                                                                                                                              |
| **Vendor-customer chat**                 | âš ï¸ Partial | REST-based threads/messages. No WebSocket/Socket.io = no real-time. Must refresh to see new messages                                                  |
| **Shipping management**                  | âœ… Works     | Zone + rate CRUD fully wired                                                                                                                          |
| **Vendor support tickets**               | âš ï¸ Partial | SupportTickets.jsx page exists but no dedicated vendor support API route in vendor.routes.js. It likely calls the admin support API or fails silently |

**Flow 2 verdict:** Works end-to-end. Main gap is no real-time chat.

---

### Flow 3: Admin â€” Manage Users â†’ Manage Vendors â†’ Approve Products â†’ Analytics

| Step                                                 | Status    | Notes                                                                                         |
| ---------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------- |
| Admin login                                          | âœ… Works | Seeded admin only (no register)                                                               |
| Dashboard analytics                                  | âœ… Works | 9 analytics endpoints, Recharts charts                                                        |
| View/manage users (activate/deactivate)              | âœ… Works | admin/customer.controller.js                                                                  |
| View/approve vendors                                 | âœ… Works | admin/vendor.controller.js                                                                    |
| Update commission per vendor                         | âœ… Works | PATCH /api/admin/vendors/:id/commission                                                       |
| Approve/reject products                              | âœ… Works | Admin catalog controller                                                                      |
| View/manage orders                                   | âœ… Works | Full CRUD + delivery assignment                                                               |
| Manage coupons / banners / campaigns                 | âœ… Works | Marketing controller fully wired                                                              |
| Manage delivery boys                                 | âœ… Works | Full CRUD with document access                                                                |
| **Settings persistence**                             | âŒ BROKEN | Settings.jsx renders but no GET/PUT Settings API routes in admin.routes.js. Data is not saved |
| **Firebase/Push notifications**                      | âŒ BROKEN | PushConfig.jsx page is a UI shell with no backend                                             |
| **Reel moderation / Affiliate payouts / Audit logs** | âŒ BROKEN | All AdminSocial module uses localStorage + hardcoded dummy data. No backend at all            |

**Flow 3 verdict:** Core admin flows work. Settings don't persist. Social/affiliate admin features are 100% UI mockups.

---

## STEP 4: BUGS & GAPS

### 4.1 â€” Critical Bugs

| #   | Bug                                                                                             | Location                                   | Impact                                                |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| B1  | `paymentStatus` stays `'pending'` forever â€” no gateway                                        | `user/order.controller.js` L362 comment    | Every non-COD order is financially unresolved         |
| B2  | `sendOrderConfirmationEmail` declared but never called                                          | `email.service.js` + `order.controller.js` | Users never get order emails                          |
| B3  | OTP verify endpoint (`POST /auth/verify-otp`) has no rate limiter or attempt count              | `user.routes.js` L37                       | Brute-force OTP bypass possible                       |
| B4  | AdminSocial module (Reel Moderation, Payouts, Audit Logs) is 100% dummy data in localStorage    | `useAdminSocial.js`                        | Not connected to any backend; production unusable     |
| B5  | Admin Settings has no persistence API                                                           | `admin.routes.js` â€” no settings GET/PUT  | Admin can't save store settings                       |
| B6  | CORS allows ALL origins (`callback(null, true)`)                                                | `app.js` L48                               | Any domain can call the API                           |
| B7  | `voteHelpful` has no deduplication â€” anyone can vote infinite times                           | `user/review.controller.js` L47            | Review scores can be manipulated                      |
| B8  | Vendor support tickets page (`VendorSupportTickets.jsx`) has no API route in `vendor.routes.js` | `vendor.routes.js`                         | Page likely throws API errors or calls wrong endpoint |
| B9  | App name mismatch â€” `APP_NAME = 'Porutkal multi vendor E-commerce'` but project is "Porutkal" | `constants.js` L5                          | Brand inconsistency in production                     |
| B10 | Search uses `$text` operator but no text index is defined in `Product.model.js`                 | `Product.model.js` â€” no `$text` index    | Search returns error or wrong results                 |

### 4.2 â€” Missing API Endpoints

| Missing Endpoint                                                 | Required By                        | Impact                      |
| ---------------------------------------------------------------- | ---------------------------------- | --------------------------- |
| `GET/PUT /api/admin/settings`                                    | Admin Settings page                | Settings can't persist      |
| Any payment gateway route (Razorpay order create, Stripe intent) | Checkout                           | No real payment             |
| Payment webhook (`POST /api/payments/webhook`)                   | Payment confirmation               | paymentStatus never updates |
| `GET /api/vendor/support-tickets`                                | VendorSupportTickets.jsx           | Page broken                 |
| Autocomplete/search suggest                                      | Search.jsx UX                      | Missing feature             |
| `POST /api/admin/notifications/push`                             | PushNotifications.jsx              | Firebase push not wired     |
| Reels API (list, moderate)                                       | AdminSocial entire module          | Whole module is mock        |
| Affiliate API (creator payout, earnings)                         | Affiliate, VendorAffiliate modules | Both modules are mocks      |

### 4.3 â€” Unused / Orphaned Files

| File                                                               | Issue                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `frontend/src/shared/utils/initializeFashionHubData.js` (19 KB)    | Seed script for hardcoded products â€” development only, should not be in production bundle |
| `frontend/src/shared/utils/initializeFashionHubProducts.js` (9 KB) | Same â€” seed data                                                                          |
| `frontend/src/modules/WebsiteBuilder/`                             | Full module with dummy data, no backend                                                     |
| `frontend/src/modules/Affiliate/`                                  | Dummy data, no backend                                                                      |
| `frontend/src/modules/VendorAffiliate/`                            | Dummy data, no backend                                                                      |
| `frontend/src/modules/AdminSocial/dummyData/`                      | All three files used in production code                                                     |
| `backend/scratch/`                                                 | Dev scratch directory in production codebase                                                |
| `backend/test.md`                                                  | Test file in production root                                                                |

### 4.4 â€” State Management Issues

| Issue                                                                               | Location                       | Impact                                     |
| ----------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| Order store persists to localStorage â€” sensitive order data in browser            | `orderStore.js` persist config | Security/privacy risk                      |
| Cart clears on localStorage wipe â€” no server backup                               | `useStore.js`                  | Poor UX, lost carts                        |
| Two separate review stores (`reviewStore.js` + `reviewsStore.js`)                   | `shared/store/`                | Naming confusion, possible duplicate logic |
| authStore double-stores token in both Zustand state AND localStorage                | `authStore.js` L39+L119        | State desync risk                          |
| Admin Vendor store (`Admin/store/vendorStore.js`) separate from Vendor module store | â€”                            | Potential data conflicts                   |

### 4.5 â€” Security Issues

| Issue                                                | Severity | Details                                                                         |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------- |
| CORS allows all origins                              | HIGH     | `origin: (origin, cb) => cb(null, true)` â€” should whitelist production domain |
| OTP verify not rate-limited                          | HIGH     | Brute-force possible on 6-digit OTP = 1M combinations                           |
| Order data persisted in localStorage                 | MEDIUM   | Includes shipping address, prices                                               |
| SMTP credentials in env (ok), but no TLS enforcement | MEDIUM   | `secure: false` in email.service.js                                             |
| Admin has no registration â€” seeded manually        | MEDIUM   | Password must be set securely; no audit trail                                   |
| `deliveryOtpDebug` field in Order model              | LOW      | Debug OTP stored (select:false), but field exists in schema                     |

---

## STEP 5: COMPLETION ROADMAP

### Phase 1 â€” Fix Core Blockers (Week 1, Days 1â€“3)

**Priority: CRITICAL**

| Task                                                                                         | Effort |
| -------------------------------------------------------------------------------------------- | ------ |
| Integrate Razorpay (or Stripe) â€” create order intent, handle webhook, update paymentStatus | Hard   |
| Call `sendOrderConfirmationEmail` inside `placeOrder` after transaction                      | Easy   |
| Add rate-limiting + attempt counter to `POST /user/auth/verify-otp`                          | Easy   |
| Add MongoDB text index to Product model (`name`, `description`)                              | Easy   |
| Fix CORS to whitelist production domain(s) only                                              | Easy   |
| Add `GET/PUT /api/admin/settings` routes + controller                                        | Medium |
| Fix `voteHelpful` â€” add IP or userId deduplication                                         | Easy   |
| Add `/api/vendor/support-tickets` route (proxy to support controller, vendor-scoped)         | Medium |

### Phase 2 â€” Complete Missing Features (Week 1, Days 4â€“7)

**Priority: HIGH**

| Task                                                                                                   | Effort |
| ------------------------------------------------------------------------------------------------------ | ------ |
| Server-side cart (save to DB on login, sync on multi-device)                                           | Hard   |
| Real-time vendor-customer chat via Socket.io                                                           | Hard   |
| Auto-trigger reviewAggregate.service after review approval                                             | Easy   |
| Order confirmation email HTML template (not just plain text)                                           | Medium |
| Admin: Wire Settings API fully (load/save to Settings model)                                           | Medium |
| Review `sendOrderConfirmationEmail` â€” called on COD place, called on payment confirmation for others | Easy   |
| Remove or replace all 3 AdminSocial dummy data files with real APIs                                    | Hard   |

### Phase 3 â€” Integrations (Week 2)

**Priority: HIGH**

| Task                                                                                                         | Effort |
| ------------------------------------------------------------------------------------------------------------ | ------ |
| Payment Gateway (Razorpay preferred for India) â€” full cycle: create order â†’ pay â†’ verify â†’ update DB | Hard   |
| Firebase Cloud Messaging (FCM) â€” push notifications for order updates                                      | Hard   |
| SMS OTP provider (Twilio/MSG91) â€” OTP via SMS instead of email only                                        | Medium |
| Affiliate / Creator module â€” design DB models + API if feature is needed                                   | Hard   |
| WebsiteBuilder â€” decide: real feature or remove                                                            | Medium |

### Phase 4 â€” UI/UX Polish (Week 2â€“3)

**Priority: MEDIUM**

| Task                                                                                      | Effort |
| ----------------------------------------------------------------------------------------- | ------ |
| Fix APP_NAME from 'Porutkal' to 'Porutkal' in constants.js                                | Easy   |
| Add search autocomplete endpoint + frontend debounce                                      | Medium |
| Order history: Add empty state illustrations                                              | Easy   |
| Add loading skeletons across Admin and Vendor dashboards                                  | Medium |
| Mobile-first review on Checkout â€” improve payment selection UX to clarify COD vs online | Easy   |
| Remove seed data files (`initializeFashionHubData.js`, etc.) from production bundle       | Easy   |

### Phase 5 â€” Testing & Deployment (Week 3+)

**Priority: MEDIUM**

| Task                                                                          | Effort |
| ----------------------------------------------------------------------------- | ------ |
| Write Jest unit tests for order placement, coupon validation, stock deduction | Hard   |
| Write Supertest API tests for all auth flows                                  | Hard   |
| Set `NODE_ENV=production`, enable MongoDB Atlas, configure SMTP properly      | Medium |
| Replace in-memory response cache with Redis for multi-instance scaling        | Hard   |
| Set CORS to whitelist only production domain                                  | Easy   |
| Add PM2 or Docker for process management                                      | Medium |
| Configure Cloudinary env for production folder separation                     | Easy   |

---

## STEP 6: FINAL OUTPUT

### 6.1 â€” Overall Feature Completion Summary

| Module                                      | Completion |
| ------------------------------------------- | ---------- |
| Authentication (User/Vendor/Admin/Delivery) | 92%        |
| Product Management                          | 90%        |
| Cart System (client-side)                   | 85%        |
| Order System (COD)                          | 88%        |
| Order System (Online Payment)               | 5%         |
| Reviews & Ratings                           | 85%        |
| Search & Filters                            | 80%        |
| Vendor Dashboard                            | 82%        |
| Admin Panel (core)                          | 88%        |
| Delivery Module                             | 95%        |
| Shipping Calculation                        | 90%        |
| Coupon System                               | 95%        |
| Marketing (Banners/Campaigns)               | 90%        |
| Notifications (in-app)                      | 85%        |
| Admin Social (Reels/Affiliate/Audit)        | 5%         |
| Payment Gateway                             | 0%         |
| Real-time Chat                              | 0%         |
| Firebase Push                               | 0%         |
| Affiliate/Creator system                    | 5%         |
| Website Builder                             | 5%         |

### **Overall Project Completion: ~68%**

---

### 6.2 â€” Top 10 Critical Issues (Ranked)

| Rank    | Issue                                                                                                                                  | Fix Effort |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| ðŸ”´ 1  | **No payment gateway** â€” all non-COD orders are created with `paymentStatus='pending'` and no charge happens                         | Hard       |
| ðŸ”´ 2  | **Order confirmation email never sent** â€” `sendOrderConfirmationEmail` declared but not called anywhere                              | Easy       |
| ðŸ”´ 3  | **OTP verify endpoint not rate-limited** â€” 6-digit OTP brute-forceable                                                               | Easy       |
| ðŸ”´ 4  | **Admin Settings has no API** â€” cannot save any settings                                                                             | Medium     |
| ðŸ”´ 5  | **AdminSocial module is 100% fake data** â€” Reel moderation, Affiliate payouts, Audit logs all use localStorage + hardcoded mock data | Hard       |
| ðŸŸ  6  | **CORS allows all origins** â€” any website can call the backend API                                                                   | Easy       |
| ðŸŸ  7  | **No MongoDB text index on Product** â€” `$text` search will fail or return wrong results                                              | Easy       |
| ðŸŸ  8  | **Vendor support tickets page has no backend route** â€” page likely crashes with 404                                                  | Medium     |
| ðŸŸ  9  | **No server-side cart** â€” cart lost on localStorage clear, no cross-device sync                                                      | Hard       |
| ðŸŸ¡ 10 | **APP_NAME = 'Porutkal'** not 'Porutkal' â€” brand name mismatch in constants                                                          | Easy       |

---

### 6.3 â€” 7-Day Action Plan

| Day       | Tasks                                                                                                                                                             |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Day 1** | 1. Add text index to Product model. 2. Rate-limit verify-otp. 3. Fix CORS to whitelist. 4. Fix APP_NAME. 5. Call sendOrderConfirmationEmail in placeOrder         |
| **Day 2** | Integrate Razorpay: create order endpoint, checkout UI payment flow, webhook handler, update paymentStatus on confirmed payment                                   |
| **Day 3** | Add `GET/PUT /api/admin/settings` controller + route. Wire Admin Settings page to API. Add `GET /api/vendor/support-tickets` route. Fix voteHelpful deduplication |
| **Day 4** | Real-time chat: integrate Socket.io on backend (vendor â†” customer thread). Update VendorChat.jsx to use socket events                                           |
| **Day 5** | Remove all 3 AdminSocial dummy data files. Create backend routes for: Reel moderation (basic), Affiliate payouts list. Wire them to real APIs                     |
| **Day 6** | Add FCM push notification support. Wire PushConfig.jsx to backend. Test order status push notifications to user                                                   |
| **Day 7** | Full end-to-end test of all 3 flows (User, Vendor, Admin). Fix any broken API calls. Remove seed/dev files from frontend bundle. Prepare .env.production          |
