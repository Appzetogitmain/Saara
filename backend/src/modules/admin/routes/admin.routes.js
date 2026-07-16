import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import * as vendorController from '../controllers/vendor.controller.js';
import * as orderController from '../controllers/order.controller.js';
import * as catalogController from '../controllers/catalog.controller.js';
import * as customerController from '../controllers/customer.controller.js';
import * as deliveryController from '../controllers/delivery.controller.js';
import * as adminPayoutController from '../controllers/payout.controller.js';
import * as returnController from '../controllers/return.controller.js';
import * as supportController from '../controllers/support.controller.js';
import * as reviewController from '../controllers/review.controller.js';
import * as analyticsController from '../controllers/analytics.controller.js';
import * as reportController from '../controllers/report.controller.js';
import * as marketingController from '../controllers/marketing.controller.js';
import * as notificationController from '../controllers/notification.controller.js';
import * as uploadController from '../controllers/upload.controller.js';
import * as settingsController from '../controllers/settings.controller.js';
import * as policyController from '../controllers/policy.controller.js';
import * as reelController from '../controllers/reel.controller.js';
import * as affiliateController from '../controllers/affiliate.controller.js';
import * as escrowController from '../controllers/escrow.controller.js';
import AppConfig from '../../../models/AppConfig.model.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import asyncHandler from '../../../utils/asyncHandler.js';
import * as homepageSectionController from '../controllers/homepageSection.controller.js';
import * as homeBannerController from '../controllers/homeBanner.controller.js';
import * as customerWalletController from '../controllers/customerWallet.controller.js';
import { audit } from '../../../middlewares/audit.js';
import { authenticate } from '../../../middlewares/authenticate.js';
import { authorize, enforceAccountStatus } from '../../../middlewares/authorize.js';
import { authLimiter } from '../../../middlewares/rateLimiter.js';
import { validate } from '../../../middlewares/validate.js';
import { uploadSingle } from '../../../middlewares/upload.js';
import { refreshTokenSchema, logoutSchema } from '../validators/auth.validator.js';
import {
    createProductSchema,
    updateProductSchema,
    categoryIdParamSchema,
    createCategorySchema,
    updateCategorySchema,
    reorderCategoriesSchema,
    brandIdParamSchema,
    createBrandSchema,
    updateBrandSchema,
} from '../validators/catalog.validator.js';
import {
    customerListQuerySchema,
    customerIdParamSchema,
    customerUpdateSchema,
    customerStatusUpdateSchema,
    customerAddressParamsSchema,
    customerOrdersQuerySchema,
    customerTransactionsQuerySchema,
    customerAddressesQuerySchema,
} from '../validators/customer.validator.js';
import {
    deliveryListQuerySchema,
    deliveryBoyIdParamSchema,
    createDeliveryBoySchema,
    updateDeliveryBoySchema,
    updateDeliveryStatusSchema,
    updateDeliveryApplicationStatusSchema,
    settleCashSchema,
} from '../validators/delivery.validator.js';
import {
    vendorListQuerySchema,
    vendorIdParamSchema,
    vendorStatusUpdateSchema,
    vendorCommissionUpdateSchema,
    vendorCommissionsQuerySchema,
    vendorDocParamsSchema,
} from '../validators/vendor.validator.js';
import {
    marketingIdParamSchema,
    campaignListQuerySchema,
} from '../validators/marketing.validator.js';

const router = Router();
const adminAuth = [authenticate, authorize('admin', 'superadmin'), enforceAccountStatus];

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/login', authLimiter, authController.login);
router.post('/auth/refresh', validate(refreshTokenSchema), authController.refresh);
router.post('/auth/logout', validate(logoutSchema), authController.logout);
router.get('/auth/profile', ...adminAuth, authController.getProfile);

// ─── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics/dashboard',      ...adminAuth, analyticsController.getDashboardStats);
router.get('/analytics/revenue',        ...adminAuth, analyticsController.getRevenueData);
router.get('/analytics/order-status',   ...adminAuth, analyticsController.getOrderStatusBreakdown);
router.get('/analytics/top-products',   ...adminAuth, analyticsController.getTopProducts);
router.get('/analytics/customer-growth',...adminAuth, analyticsController.getCustomerGrowth);
router.get('/analytics/recent-orders',  ...adminAuth, analyticsController.getRecentOrders);
router.get('/analytics/sales',          ...adminAuth, analyticsController.getSalesData);
router.get('/analytics/finance-summary',...adminAuth, analyticsController.getFinancialSummary);
router.get('/analytics/inventory-stats',...adminAuth, analyticsController.getInventoryStats);

// ─── Orders ───────────────────────────────────────────────────────────────────
router.get('/orders', ...adminAuth, orderController.getAllOrders);
router.get('/orders/:id', ...adminAuth, orderController.getOrderById);
router.patch('/orders/:id/status', ...adminAuth, audit('UPDATE_ORDER_STATUS', 'Order'), orderController.updateOrderStatus);

router.delete('/orders/:id', ...adminAuth, audit('DELETE_ORDER', 'Order'), orderController.deleteOrder);

// ─── Products ─────────────────────────────────────────────────────────────────
router.get('/products', ...adminAuth, catalogController.getAllProducts);
router.get('/products/:id', ...adminAuth, catalogController.getProductById);
router.post('/products', ...adminAuth, validate(createProductSchema), catalogController.createProduct);

router.put('/products/:id', ...adminAuth, validate(updateProductSchema), catalogController.updateProduct);
router.delete('/products/:id', ...adminAuth, catalogController.deleteProduct);

// ─── Categories ───────────────────────────────────────────────────────────────
router.get('/categories', ...adminAuth, catalogController.getAllCategories);
router.post('/categories', ...adminAuth, validate(createCategorySchema), catalogController.createCategory);
router.patch('/categories/reorder', ...adminAuth, validate(reorderCategoriesSchema), catalogController.reorderCategories);
router.put('/categories/:id', ...adminAuth, validate(categoryIdParamSchema, 'params'), validate(updateCategorySchema), catalogController.updateCategory);
router.delete('/categories/:id', ...adminAuth, validate(categoryIdParamSchema, 'params'), catalogController.deleteCategory);

// ─── Brands ───────────────────────────────────────────────────────────────────
router.get('/brands', ...adminAuth, catalogController.getAllBrands);
router.post('/brands', ...adminAuth, validate(createBrandSchema), catalogController.createBrand);
router.put('/brands/:id', ...adminAuth, validate(brandIdParamSchema, 'params'), validate(updateBrandSchema), catalogController.updateBrand);
router.delete('/brands/:id', ...adminAuth, validate(brandIdParamSchema, 'params'), catalogController.deleteBrand);

router.get('/category-requests', ...adminAuth, catalogController.getAllCategoryRequests);
router.post('/category-requests/:id/approve', ...adminAuth, validate(categoryIdParamSchema, 'params'), catalogController.approveCategoryRequest);
router.post('/category-requests/:id/reject', ...adminAuth, validate(categoryIdParamSchema, 'params'), catalogController.rejectCategoryRequest);

router.get('/brand-requests', ...adminAuth, catalogController.getAllBrandRequests);
router.post('/brand-requests/:id/approve', ...adminAuth, validate(brandIdParamSchema, 'params'), catalogController.approveBrandRequest);
router.post('/brand-requests/:id/reject', ...adminAuth, validate(brandIdParamSchema, 'params'), catalogController.rejectBrandRequest);
router.post('/brand-requests/:id/convert-to-global', ...adminAuth, validate(brandIdParamSchema, 'params'), catalogController.convertToGlobalBrandRequest);

// ─── Vendors ──────────────────────────────────────────────────────────────────
router.get('/vendors', ...adminAuth, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/pending', ...adminAuth, (req, res, next) => { req.query.status = 'pending'; next(); }, validate(vendorListQuerySchema, 'query'), vendorController.getAllVendors);
router.get('/vendors/:id', ...adminAuth, validate(vendorIdParamSchema, 'params'), vendorController.getVendorDetail);
router.get('/vendors/:id/commissions', ...adminAuth, validate(vendorIdParamSchema, 'params'), validate(vendorCommissionsQuerySchema, 'query'), vendorController.getVendorCommissions);
router.patch('/vendors/:id/status', ...adminAuth, audit('UPDATE_VENDOR_STATUS', 'Vendor'), validate(vendorIdParamSchema, 'params'), validate(vendorStatusUpdateSchema), vendorController.updateVendorStatus);
router.patch('/vendors/:id/commission', ...adminAuth, audit('UPDATE_VENDOR_COMMISSION', 'Vendor'), validate(vendorIdParamSchema, 'params'), validate(vendorCommissionUpdateSchema), vendorController.updateCommissionRate);
router.get('/vendors/:id/documents', ...adminAuth, validate(vendorIdParamSchema, 'params'), vendorController.getVendorDocuments);
router.patch('/vendors/:id/documents/:docId/status', ...adminAuth, validate(vendorDocParamsSchema, 'params'), vendorController.updateVendorDocumentStatus);
router.post('/vendors/:id/documents/bulk-status', ...adminAuth, validate(vendorIdParamSchema, 'params'), vendorController.bulkUpdateVendorDocumentStatus);

// ─── Customers ────────────────────────────────────────────────────────────────
router.get('/customers', ...adminAuth, validate(customerListQuerySchema, 'query'), customerController.getAllCustomers);
router.get('/customers/addresses', ...adminAuth, validate(customerAddressesQuerySchema, 'query'), customerController.getCustomerAddresses);
router.get('/customers/transactions', ...adminAuth, validate(customerTransactionsQuerySchema, 'query'), customerController.getCustomerTransactions);
router.get('/customers/:id/orders', ...adminAuth, validate(customerIdParamSchema, 'params'), validate(customerOrdersQuerySchema, 'query'), customerController.getCustomerOrders);
router.get('/customers/:id', ...adminAuth, validate(customerIdParamSchema, 'params'), customerController.getCustomerById);
router.put('/customers/:id', ...adminAuth, validate(customerIdParamSchema, 'params'), validate(customerUpdateSchema), customerController.updateCustomerDetail);
router.patch('/customers/:id/status', ...adminAuth, validate(customerIdParamSchema, 'params'), customerController.updateCustomerStatus);
router.delete('/customers/:customerId/addresses/:addressId', ...adminAuth, validate(customerAddressParamsSchema, 'params'), customerController.deleteCustomerAddress);

// Wallet Management routes
router.get('/wallet/summary', ...adminAuth, customerWalletController.getAdminWalletSummary);
router.post('/wallet/admin-credit', ...adminAuth, customerWalletController.adminCreditWallet);
router.post('/wallet/admin-debit', ...adminAuth, customerWalletController.adminDebitWallet);
router.get('/customers/:id/wallet', ...adminAuth, customerWalletController.getAnyCustomerWallet);
router.get('/customers/:id/wallet/transactions', ...adminAuth, customerWalletController.getAnyCustomerWalletTransactions);
router.patch('/customers/:id/wallet/toggle-lock', ...adminAuth, customerWalletController.toggleLockCustomerWallet);

// ─── Delivery ─────────────────────────────────────────────────────────────────
router.get('/delivery-boys', ...adminAuth, validate(deliveryListQuerySchema, 'query'), deliveryController.getAllDeliveryBoys);
router.post('/delivery-boys', ...adminAuth, validate(createDeliveryBoySchema), deliveryController.createDeliveryBoy);
router.get('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), deliveryController.getDeliveryBoyById);
router.put('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryBoySchema), deliveryController.updateDeliveryBoy);
router.delete('/delivery-boys/:id', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), deliveryController.deleteDeliveryBoy);
router.patch('/delivery-boys/:id/status', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryStatusSchema), deliveryController.updateDeliveryBoyStatus);
router.patch('/delivery-boys/:id/application-status', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(updateDeliveryApplicationStatusSchema), deliveryController.updateDeliveryBoyApplicationStatus);
router.post('/delivery-boys/:id/settle-cash', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), validate(settleCashSchema), audit('SETTLE_COD_CASH', 'DeliveryBoy'), deliveryController.settleCash);
router.post('/delivery-boys/:id/adjustment', ...adminAuth, validate(deliveryBoyIdParamSchema, 'params'), audit('WALLET_ADJUSTMENT', 'DeliveryBoy'), adminPayoutController.adjustWalletBalance);

router.get('/delivery/payout-requests', ...adminAuth, adminPayoutController.getWithdrawalRequests);
router.patch('/delivery/payout-requests/:id/status', ...adminAuth, audit('PROCESS_DELIVERY_PAYOUT', 'DeliveryWithdrawal'), adminPayoutController.updateWithdrawalStatus);

// ─── Return Requests ──────────────────────────────────────────────────────────
router.get('/return-requests', ...adminAuth, returnController.getAllReturnRequests);
router.get('/return-requests/:id', ...adminAuth, returnController.getReturnRequestById);
router.patch('/return-requests/:id/status', ...adminAuth, returnController.updateReturnRequestStatus);

// ─── Support Tickets ──────────────────────────────────────────────────────────
router.get('/support/tickets', ...adminAuth, supportController.getAllTickets);
router.get('/support/tickets/:id', ...adminAuth, supportController.getTicketById);
router.patch('/support/tickets/:id/status', ...adminAuth, supportController.updateTicketStatus);
router.post('/support/tickets/:id/messages', ...adminAuth, supportController.addTicketMessage);
router.get('/support/ticket-types', ...adminAuth, supportController.getAllTicketTypes);
router.post('/support/ticket-types', ...adminAuth, supportController.createTicketType);
router.post('/support/ticket-types/reorder', ...adminAuth, supportController.reorderTicketTypes);
router.put('/support/ticket-types/:id', ...adminAuth, supportController.updateTicketType);
router.delete('/support/ticket-types/:id', ...adminAuth, supportController.deleteTicketType);

// ─── Product Reviews ──────────────────────────────────────────────────────────
router.get('/reviews', ...adminAuth, reviewController.getAllReviews);
router.patch('/reviews/:id/status', ...adminAuth, reviewController.updateReviewStatus);
router.delete('/reviews/:id', ...adminAuth, reviewController.deleteReview);
router.post('/uploads/image', ...adminAuth, uploadSingle('image'), uploadController.uploadImage);

// ─── Marketing & Promotions ──────────────────────────────────────────────────
// Coupons
router.get('/marketing/coupons', ...adminAuth, marketingController.getAllCoupons);
router.post('/marketing/coupons', ...adminAuth, marketingController.createCoupon);
router.put('/marketing/coupons/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateCoupon);
router.delete('/marketing/coupons/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteCoupon);

// Banners
router.get('/marketing/banners', ...adminAuth, marketingController.getAllBanners);
router.post('/marketing/banners', ...adminAuth, marketingController.createBanner);
router.patch('/marketing/banners/reorder', ...adminAuth, marketingController.reorderBanners);
router.put('/marketing/banners/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateBanner);
router.delete('/marketing/banners/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteBanner);

// Homepage Sections
router.get('/marketing/homepage-sections', ...adminAuth, homepageSectionController.getAllSections);
router.post('/marketing/homepage-sections', ...adminAuth, homepageSectionController.createSection);
router.patch('/marketing/homepage-sections/reorder', ...adminAuth, homepageSectionController.reorderSections);
router.put('/marketing/homepage-sections/:id', ...adminAuth, homepageSectionController.updateSection);
router.delete('/marketing/homepage-sections/:id', ...adminAuth, homepageSectionController.deleteSection);

// Homepage Banners (Library)
router.get('/marketing/homepage-banners', ...adminAuth, homeBannerController.getAllBanners);
router.post('/marketing/homepage-banners', ...adminAuth, homeBannerController.createBanner);
router.put('/marketing/homepage-banners/:id', ...adminAuth, homeBannerController.updateBanner);
router.delete('/marketing/homepage-banners/:id', ...adminAuth, homeBannerController.deleteBanner);

// Campaigns
router.get('/marketing/campaigns', ...adminAuth, validate(campaignListQuerySchema, 'query'), marketingController.getAllCampaigns);
router.post('/marketing/campaigns', ...adminAuth, marketingController.createCampaign);
router.put('/marketing/campaigns/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.updateCampaign);
router.delete('/marketing/campaigns/:id', ...adminAuth, validate(marketingIdParamSchema, 'params'), marketingController.deleteCampaign);

// Shop configuration
router.get('/marketing/shop-config', ...adminAuth, asyncHandler(async (req, res) => {
    let config = await AppConfig.findOne({ key: 'shop' }).lean();
    if (!config) {
        config = await AppConfig.create({
            key: 'shop',
            value: {
                defaultSort: 'newest',
                productsPerPage: 20,
                defaultViewMode: 'grid',
                quickFilters: [
                    { label: 'All', queryParams: '{}', isActive: true, order: 1 },
                    { label: 'New Arrivals', queryParams: '{"isNewArrival":"true"}', isActive: true, order: 2 },
                    { label: 'Best Sellers', queryParams: '{"sort":"popular"}', isActive: true, order: 3 },
                    { label: 'Top Rated', queryParams: '{"minRating":"4"}', isActive: true, order: 4 },
                    { label: 'Discounts', queryParams: '{"discount":"10"}', isActive: true, order: 5 },
                    { label: 'In Stock', queryParams: '{"stock":"in_stock"}', isActive: true, order: 6 }
                ],
                featuredCategories: [],
                featuredBrands: [],
                bannerAsset: null,
                enabledFilters: {
                    category: true,
                    brand: true,
                    price: true,
                    rating: true,
                    discount: true,
                    stock: true,
                    vendor: true,
                    deliveryType: true,
                    color: true,
                    size: true
                }
            }
        });
    }
    res.status(200).json(new ApiResponse(200, config.value, 'Shop config fetched.'));
}));

router.put('/marketing/shop-config', ...adminAuth, asyncHandler(async (req, res) => {
    const updated = await AppConfig.findOneAndUpdate(
        { key: 'shop' },
        { $set: { value: req.body } },
        { new: true, upsert: true }
    );
    res.status(200).json(new ApiResponse(200, updated.value, 'Shop config updated successfully.'));
}));

// ─── Reports ──────────────────────────────────────────────────────────────────
router.get('/reports/sales', ...adminAuth, reportController.getSalesReport);
router.get('/reports/inventory', ...adminAuth, reportController.getInventoryReport);

// ─── Notifications ─────────────────────────────────────────────────────────────
router.get('/notifications', ...adminAuth, notificationController.getAdminNotifications);
router.put('/notifications/:id/read', ...adminAuth, notificationController.markAsRead);
router.put('/notifications/read-all', ...adminAuth, notificationController.markAllAsRead);

// ─── System Settings ──────────────────────────────────────────────────────────
router.get('/settings', ...adminAuth, settingsController.getAllSettings);
router.get('/settings/:key', ...adminAuth, settingsController.getSettings);
router.put('/settings/:key', ...adminAuth, audit('UPDATE_SETTINGS', 'Settings'), settingsController.updateSettings);

// ─── System Policies ──────────────────────────────────────────────────────────
router.get('/policies/:type', ...adminAuth, policyController.getPolicy);
router.put('/policies/:type', ...adminAuth, audit('UPDATE_POLICY', 'Policy'), policyController.updatePolicy);

// ─── Reel Moderation ─────────────────────────────────────────────────────────
router.get('/reels/pending', ...adminAuth, reelController.getPendingReels);
router.patch('/reels/:id/moderate', ...adminAuth, audit('MODERATE_REEL', 'Reel'), reelController.moderateReel);

// ─── Affiliate Management ───────────────────────────────────────────────────
router.get('/affiliates/payouts/pending', ...adminAuth, affiliateController.getPendingPayouts);
router.patch('/affiliates/:id/payouts/:payoutId', ...adminAuth, audit('PROCESS_AFFILIATE_PAYOUT', 'Affiliate'), affiliateController.completePayout);

// ─── Escrow & Payout Management ──────────────────────────────────────────────
router.get('/escrow/summary',                  ...adminAuth, escrowController.getEscrowSummary);
router.get('/escrow/withdrawals',              ...adminAuth, escrowController.getWithdrawalRequests);
router.patch('/escrow/withdrawals/:id/status', ...adminAuth, audit('PROCESS_VENDOR_WITHDRAWAL', 'Withdrawal'), escrowController.updateWithdrawalStatus);

export default router;
