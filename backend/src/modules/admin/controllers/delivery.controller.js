import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import { Order } from '../../../models/Order.model.js';
import ApiError from '../../../utils/ApiError.js';
import { ApiResponse } from '../../../utils/ApiResponse.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
import { sendEmail } from '../../../services/email.service.js';
import { createNotification } from '../../../services/notification.service.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import CashSettlement from '../../../models/CashSettlement.model.js';
import DeliveryWalletTransaction from '../../../models/DeliveryWalletTransaction.model.js';
import DeliveryWithdrawal from '../../../models/DeliveryWithdrawal.model.js';

const DOC_TOKEN_TTL_MS = 10 * 60 * 1000;
const DOC_TOKEN_QUERY_KEY = 'docToken';

const buildDocToken = (relativePath) => {
    const exp = Date.now() + DOC_TOKEN_TTL_MS;
    const payload = `${relativePath}|${exp}`;
    const signature = crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'delivery-doc-secret')
        .update(payload)
        .digest('hex');
    return `${exp}.${signature}`;
};

const buildDocUrl = (req, relativePath = '') => {
    if (!relativePath) return '';
    if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
    const baseUrl = `${req.protocol}://${req.get('host')}${relativePath}`;
    if (relativePath.startsWith('/uploads/delivery-docs/')) {
        const token = buildDocToken(relativePath);
        return `${baseUrl}?${DOC_TOKEN_QUERY_KEY}=${encodeURIComponent(token)}`;
    }
    return baseUrl;
};

/**
 * @desc    Get all delivery boys with filtering and pagination
 * @route   GET /api/admin/delivery-boys
 * @access  Private (Admin)
 */
export const getAllDeliveryBoys = asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search = '', status, applicationStatus } = req.query;
    const numericPage = Number(page) || 1;
    const numericLimit = Number(limit) || 10;

    const filter = {};

    if (search) {
        filter.$or = [
            { name: { $regex: search, $options: 'i' } },
            { email: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
            { address: { $regex: search, $options: 'i' } },
        ];
    }

    if (status) {
        filter.isActive = status === 'active';
    }

    if (applicationStatus) {
        filter.applicationStatus = applicationStatus;
    }

    const deliveryBoys = await DeliveryBoy.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((numericPage - 1) * numericLimit)
        .limit(numericLimit);

    const total = await DeliveryBoy.countDocuments(filter);

    // Aggregate stats for each delivery boy
    const boysWithStats = await Promise.all(deliveryBoys.map(async (boy) => {
        const shipments = await mongoose.model('Shipment').find({ deliveryBoyId: boy._id }).select('status isCashSettled orderId').lean();
        
        let totalDeliveries = 0;
        let pendingDeliveries = 0;
        const pendingCashOrderIds = new Set();
        
        shipments.forEach(s => {
            if (s.status === 'delivered') totalDeliveries++;
            else if (['pending', 'processing', 'shipped'].includes(s.status)) pendingDeliveries++;
            
            if (s.status === 'delivered' && !s.isCashSettled) {
                pendingCashOrderIds.add(s.orderId.toString());
            }
        });
        
        let cashInHand = 0;
        if (pendingCashOrderIds.size > 0) {
            const orders = await Order.find({
                _id: { $in: Array.from(pendingCashOrderIds) },
                paymentMethod: { $in: ['cod', 'cash'] }
            }).select('total').lean();
            
            cashInHand = orders.reduce((sum, o) => sum + (o.total || 0), 0);
        }
        
        const boyStats = { totalDeliveries, pendingDeliveries, cashInHand };
        return {
            ...boy._doc,
            id: boy._id,
            status: boy.isActive ? 'active' : 'inactive',
            applicationStatus: boy.applicationStatus || 'approved',
            documents: {
                drivingLicense: boy.documents?.drivingLicense || '',
                aadharCard: boy.documents?.aadharCard || '',
            },
            documentUrls: {
                drivingLicense: buildDocUrl(req, boy.documents?.drivingLicense || ''),
                aadharCard: buildDocUrl(req, boy.documents?.aadharCard || ''),
            },
            stats: {
                totalDeliveries: boyStats.totalDeliveries,
                pendingDeliveries: boyStats.pendingDeliveries,
                cashInHand: boyStats.cashInHand
            }
        };
    }));

    res.status(200).json(
        new ApiResponse(200, {
            deliveryBoys: boysWithStats,
            pagination: {
                total,
                page: numericPage,
                limit: numericLimit,
                pages: Math.ceil(total / numericLimit)
            }
        }, 'Delivery boys fetched successfully')
    );
});

/**
 * @desc    Get delivery boy detail with order history
 * @route   GET /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const getDeliveryBoyById = asyncHandler(async (req, res) => {
    const boy = await DeliveryBoy.findById(req.params.id).select('-password');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    // Fetch recent shipments instead of legacy orders
    const shipments = await mongoose.model('Shipment').find({ deliveryBoyId: boy._id })
        .populate('orderId', 'orderId total paymentMethod createdAt')
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

    const stats = await mongoose.model('Shipment').aggregate([
        { $match: { deliveryBoyId: boy._id } },
        {
            $group: {
                _id: null,
                totalDeliveries: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
                pendingDeliveries: { $sum: { $cond: [{ $in: ['$status', ['pending', 'processing', 'shipped']] }, 1, 0] } },
            }
        }
    ]);

    const boyStats = stats.length > 0 ? stats[0] : { totalDeliveries: 0, pendingDeliveries: 0 };

    // Calculate cash in hand by querying unique Orders tied to un-settled COD shipments
    const pendingCashShipments = await mongoose.model('Shipment').find({
        deliveryBoyId: boy._id,
        status: 'delivered',
        isCashSettled: { $ne: true }
    }).select('orderId').lean();

    let cashInHand = 0;
    if (pendingCashShipments.length > 0) {
        const orderIds = [...new Set(pendingCashShipments.map(s => s.orderId.toString()))];
        const cashOrders = await Order.find({
            _id: { $in: orderIds },
            paymentMethod: { $in: ['cod', 'cash'] }
        }).select('total').lean();
        cashInHand = cashOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    }
    boyStats.cashInHand = cashInHand;

    // Transform shipments into a format the frontend expects (legacy Order format)
    // since the frontend hasn't been updated to read shipments here yet.
    const orders = shipments.map(s => ({
        _id: s.orderId ? s.orderId._id : s._id,
        orderId: s.orderId ? s.orderId.orderId : s.shipmentNumber,
        status: s.status,
        total: s.orderId ? s.orderId.total : s.customerShippingCharge,
        paymentMethod: s.orderId ? s.orderId.paymentMethod : 'prepaid',
        createdAt: s.createdAt,
    }));

    res.status(200).json(
        new ApiResponse(200, {
            ...boy._doc,
            id: boy._id,
            status: boy.isActive ? 'active' : 'inactive',
            applicationStatus: boy.applicationStatus || 'approved',
            documentUrls: {
                drivingLicense: buildDocUrl(req, boy.documents?.drivingLicense || ''),
                aadharCard: buildDocUrl(req, boy.documents?.aadharCard || ''),
            },
            stats: boyStats,
            recentOrders: orders
        }, 'Delivery boy details fetched successfully')
    );
});

/**
 * @desc    Create a new delivery boy
 * @route   POST /api/admin/delivery-boys
 * @access  Private (Admin)
 */
export const createDeliveryBoy = asyncHandler(async (req, res) => {
    const { name, email, password, phone, address, vehicleType, vehicleNumber, isActive } = req.body;

    const existedUser = await DeliveryBoy.findOne({
        $or: [{ email }, { phone }]
    });

    if (existedUser) {
        throw new ApiError(409, 'User with email or phone already exists');
    }

    const boy = await DeliveryBoy.create({
        name,
        email,
        password,
        phone,
        address,
        vehicleType,
        vehicleNumber,
        isActive: typeof isActive === 'boolean' ? isActive : true,
        applicationStatus: 'approved',
    });

    const createdBoy = await DeliveryBoy.findById(boy._id).select('-password');

    if (!createdBoy) {
        throw new ApiError(500, 'Something went wrong while creating the delivery boy');
    }

    res.status(201).json(
        new ApiResponse(201, createdBoy, 'Delivery boy created successfully')
    );
});

/**
 * @desc    Update delivery boy status
 * @route   PATCH /api/admin/delivery-boys/:id/status
 * @access  Private (Admin)
 */
export const updateDeliveryBoyStatus = asyncHandler(async (req, res) => {
    const { isActive } = req.body;
    if (typeof isActive !== 'boolean') {
        throw new ApiError(400, 'isActive status must be a boolean');
    }

    const boy = await DeliveryBoy.findByIdAndUpdate(
        req.params.id,
        { isActive },
        { new: true }
    ).select('-password');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    res.status(200).json(
        new ApiResponse(200, boy, `Delivery boy status updated to ${isActive ? 'active' : 'inactive'}`)
    );
});

/**
 * @desc    Approve or reject delivery registration
 * @route   PATCH /api/admin/delivery-boys/:id/application-status
 * @access  Private (Admin)
 */
export const updateDeliveryBoyApplicationStatus = asyncHandler(async (req, res) => {
    const { applicationStatus, reason = '' } = req.body;

    if (!['approved', 'rejected'].includes(applicationStatus)) {
        throw new ApiError(400, 'applicationStatus must be approved or rejected');
    }

    const boy = await DeliveryBoy.findById(req.params.id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    boy.applicationStatus = applicationStatus;
    boy.rejectionReason = applicationStatus === 'rejected' ? String(reason || '').trim() : '';
    boy.isActive = applicationStatus === 'approved';
    if (applicationStatus === 'rejected') {
        boy.isAvailable = false;
        boy.status = 'offline';
    }
    await boy.save();

    try {
        if (applicationStatus === 'approved') {
            await sendEmail({
                to: boy.email,
                subject: 'Delivery account approved',
                text: 'Your delivery account has been approved. You can now log in.',
                html: '<p>Your delivery account has been <strong>approved</strong>. You can now log in.</p>',
            });
        } else {
            await sendEmail({
                to: boy.email,
                subject: 'Delivery account rejected',
                text: `Your delivery account was rejected.${boy.rejectionReason ? ` Reason: ${boy.rejectionReason}` : ''}`,
                html: `<p>Your delivery account was <strong>rejected</strong>.${boy.rejectionReason ? ` Reason: ${boy.rejectionReason}` : ''}</p>`,
            });
        }
    } catch (err) {
        console.warn(`[Delivery Approval Email] Failed for ${boy.email}: ${err.message}`);
    }

    await createNotification({
        recipientId: boy._id,
        recipientType: 'delivery',
        title: `Application ${applicationStatus}`,
        message:
            applicationStatus === 'approved'
                ? 'Your delivery account has been approved by admin.'
                : `Your delivery account was rejected${boy.rejectionReason ? `: ${boy.rejectionReason}` : '.'}`,
        type: 'system',
        data: {
            applicationStatus,
            reason: boy.rejectionReason || '',
        },
    });

    const refreshed = await DeliveryBoy.findById(boy._id).select('-password');
    res.status(200).json(
        new ApiResponse(200, refreshed, `Delivery registration ${applicationStatus} successfully`)
    );
});

/**
 * @desc    Update delivery boy details
 * @route   PUT /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const updateDeliveryBoy = asyncHandler(async (req, res) => {
    const { name, email, phone, address, vehicleType, vehicleNumber, isActive } = req.body;

    const existing = await DeliveryBoy.findOne({
        _id: { $ne: req.params.id },
        $or: [{ email }, { phone }]
    });
    if (existing) {
        throw new ApiError(409, 'User with email or phone already exists');
    }

    const payload = {
        name,
        email,
        phone,
        address,
        vehicleType,
        vehicleNumber,
    };
    if (typeof isActive === 'boolean') payload.isActive = isActive;

    const boy = await DeliveryBoy.findByIdAndUpdate(
        req.params.id,
        payload,
        { new: true, runValidators: true }
    ).select('-password');

    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    res.status(200).json(
        new ApiResponse(200, boy, 'Delivery boy updated successfully')
    );
});

/**
 * @desc    Delete a delivery boy
 * @route   DELETE /api/admin/delivery-boys/:id
 * @access  Private (Admin)
 */
export const deleteDeliveryBoy = asyncHandler(async (req, res) => {
    const boy = await DeliveryBoy.findById(req.params.id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    const activeDeliveries = await mongoose.model('Shipment').countDocuments({
        deliveryBoyId: boy._id,
        status: { $in: ['pending', 'processing', 'ready_for_pickup', 'shipped'] },
    });

    if (activeDeliveries > 0) {
        throw new ApiError(409, 'Cannot delete delivery boy with active assigned orders');
    }

    // T3.4: Block deletion if financial obligations exist — prevents orphaned records
    const pendingWithdrawals = await DeliveryWithdrawal.countDocuments({
        deliveryBoyId: boy._id,
        status: { $in: ['pending', 'processing'] },
    });
    if (pendingWithdrawals > 0) {
        throw new ApiError(409, 'Cannot delete delivery boy with pending withdrawal requests. Please process or reject all withdrawals first.');
    }

    if ((boy.cashInHand || 0) > 0) {
        throw new ApiError(409, `Cannot delete delivery boy with unsettled cash in hand (₹${boy.cashInHand}). Please complete cash settlement first.`);
    }

    await DeliveryBoy.findByIdAndDelete(req.params.id);

    res.status(200).json(
        new ApiResponse(200, null, 'Delivery boy deleted successfully')
    );
});


/**
 * @desc    Settle cash in hand for a delivery boy
 * @route   POST /api/admin/delivery-boys/:id/settle-cash
 * @access  Private (Admin)
 */
export const settleCash = asyncHandler(async (req, res) => {
    const { receiptPhoto, notes, paymentMode = 'cash' } = req.body;
    const boy = await DeliveryBoy.findById(req.params.id);
    if (!boy) {
        throw new ApiError(404, 'Delivery boy not found');
    }

    const session = await mongoose.startSession();
    let settledAmount = 0;
    let modifiedCount = 0;

    try {
        await session.withTransaction(async () => {
            // Find unsettled shipments for this boy
            const pendingShipments = await mongoose.model('Shipment').find({
                deliveryBoyId: req.params.id,
                status: 'delivered',
                isCashSettled: { $ne: true }
            }).select('orderId').session(session).lean();
            
            if (pendingShipments.length === 0) return;
            
            const uniqueOrderIds = [...new Set(pendingShipments.map(s => s.orderId.toString()))];
            
            const pendingOrders = await Order.find({
                _id: { $in: uniqueOrderIds },
                paymentMethod: { $in: ['cod', 'cash'] }
            }).session(session).select('_id total').lean();

            if (pendingOrders.length === 0) {
                return;
            }

            const orderIds = pendingOrders.map((o) => o._id);
            settledAmount = parseFloat(pendingOrders.reduce((sum, o) => sum + Number(o.total || 0), 0).toFixed(2));

            // 1. Create CashSettlement document
            const [settlement] = await CashSettlement.create(
                [{
                    deliveryBoyId: req.params.id,
                    amount: settledAmount,
                    collectedByAdmin: req.user.id,
                    orders: orderIds, // Legacy field, kept for history
                    paymentMode,
                    receiptPhoto,
                    notes: notes || `Settlement for ${orderIds.length} orders`
                }],
                { session }
            );

            // 2. Mark orders as settled
            const result = await Order.updateMany(
                { _id: { $in: orderIds } },
                {
                    $set: {
                        isCashSettled:    true,
                        settledAt:        new Date(),
                        cashSettlementId: settlement._id,
                        paymentStatus:    'paid',         // fix: COD orders now correctly show paymentStatus: 'paid'
                    }
                },
                { session }
            );
            modifiedCount = result.modifiedCount;
            if (modifiedCount !== orderIds.length) {
                throw new Error('Some orders in this session have already been settled.');
            }

            // 3. Mark shipments as settled
            await mongoose.model('Shipment').updateMany(
                { orderId: { $in: orderIds }, deliveryBoyId: req.params.id },
                {
                    $set: {
                        isCashSettled: true,
                        cashSettlementId: settlement._id
                    }
                },
                { session }
            );

            // 3. Update rider balances
            const freshBoy = await DeliveryBoy.findById(req.params.id).session(session);
            const walletBefore = freshBoy.walletBalance;
            const cashBefore = freshBoy.cashInHand;

            freshBoy.cashCollected = parseFloat((freshBoy.cashCollected + settledAmount).toFixed(2));
            freshBoy.cashInHand = parseFloat((freshBoy.cashInHand - settledAmount).toFixed(2));
            await freshBoy.save({ session });

            // 4. Log ledger transaction
            await DeliveryWalletTransaction.create(
                [{
                    deliveryBoyId: req.params.id,
                    type: 'COD_SETTLEMENT',
                    amount: -settledAmount,
                    referenceId: `COD_SETTLEMENT_SESSION_${settlement._id}`,
                    performedBy: { role: 'admin', id: req.user.id },
                    settlementId: settlement._id,
                    walletBalanceBefore: walletBefore,
                    walletBalanceAfter: freshBoy.walletBalance,
                    cashInHandBefore: cashBefore,
                    cashInHandAfter: freshBoy.cashInHand,
                    notes: notes || `Settled COD cash collections of ₹${settledAmount}`
                }],
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    if (settledAmount === 0) {
        return res.status(200).json(
            new ApiResponse(200, { modifiedCount: 0, settledAmount: 0 }, 'No pending cash to settle')
        );
    }

    // Notify delivery boy of cash settlement
    createNotification({
        recipientId:   req.params.id,
        recipientType: 'delivery',
        title:         'Cash Collected by Admin',
        message:       `Admin collected \u20b9${settledAmount} COD cash from you for ${modifiedCount} order(s). Your cashInHand has been updated.`,
        type:          'wallet',
        data:          { settledAmount, modifiedCount },
    }).catch(console.error);

    res.status(200).json(
        new ApiResponse(
            200,
            { modifiedCount, settledAmount },
            `Settled cash for ${modifiedCount} orders`
        )
    );
});
