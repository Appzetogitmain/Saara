import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import DeliveryWalletTransaction from '../../../models/DeliveryWalletTransaction.model.js';
import DeliveryBoy from '../../../models/DeliveryBoy.model.js';
import mongoose from 'mongoose';
import Vendor from '../../../models/Vendor.model.js';
import Order from '../../../models/Order.model.js';
import crypto from 'crypto';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { autoAssignReturnPickupPartner, autoAssignExchangeReplacementPartner } from '../../../services/assignmentService.js';
import { notifyReturnUpdate } from '../../../services/socket.service.js';
import { buildReturnItemsSummary, buildExchangeSummary } from '../../../utils/notificationProductFormatter.js';

// GET /api/delivery/returns
export const getAssignedReturnPickups = asyncHandler(async (req, res) => {
    const { status } = req.query;
    const filter = { deliveryBoyId: req.user.id };

    if (status === 'open') {
        filter.status = { $in: ['pickup_pending', 'pickup_assigned', 'picked_up', 'replacement_ready', 'replacement_assigned', 'out_for_delivery'] };
    } else if (status) {
        filter.status = status;
    }

    const returns = await ReturnRequest.find(filter)
        .populate('orderId', 'orderId shippingAddress')
        .populate('vendorId', 'storeName shopName phone address')
        .sort({ createdAt: -1 });

    return res.status(200).json(new ApiResponse(200, returns, 'Assigned return pickups fetched.'));
});

// GET /api/delivery/returns/:id
export const getReturnPickupDetail = asyncHandler(async (req, res) => {
    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    })
    .populate('orderId', 'orderId shippingAddress items total subtotal paymentMethod paymentStatus')
    .populate('vendorId', 'storeName shopName phone address email')
    .populate('userId', 'name email phone');

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    return res.status(200).json(new ApiResponse(200, returnRequest, 'Return pickup details fetched.'));
});

// POST /api/delivery/returns/:id/accept
export const acceptReturnPickup = asyncHandler(async (req, res) => {
    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    }).populate('orderId', 'orderId').populate('vendorId', 'storeName');

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    if (returnRequest.deliveryAssignmentStatus !== 'assigned') {
        throw new ApiError(409, `Cannot accept offer. Assignment status is ${returnRequest.deliveryAssignmentStatus}.`);
    }

    const isExchangeLeg2 = returnRequest.status === 'replacement_assigned';

    returnRequest.deliveryAssignmentStatus = 'accepted';
    if (!isExchangeLeg2) {
        returnRequest.status = 'pickup_assigned';
    } else {
        const handoverOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const handoverHash = crypto.createHash('sha256').update(handoverOtp).digest('hex');
        returnRequest.vendorHandoverOtpHash = handoverHash;
        returnRequest.vendorHandoverOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        returnRequest.vendorHandoverOtpAttempts = 0;
        returnRequest.vendorHandoverOtpVerified = false;
        
        const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
        if (!isProduction) {
            returnRequest.vendorHandoverOtpDebug = handoverOtp;
        }
    }
    await returnRequest.save();
    notifyReturnUpdate(returnRequest);

    const rItemsSummary = buildExchangeSummary(returnRequest);

    // Notify customer
    if (returnRequest.userId) {
        await createNotification({
            recipientId: returnRequest.userId,
            recipientType: 'user',
            title: isExchangeLeg2 ? 'Rider assigned for replacement delivery' : 'Rider assigned for return pickup',
            message: isExchangeLeg2
                ? `A delivery partner has been assigned to deliver your replacement items for order ${returnRequest.orderId?.orderId || ''}.${rItemsSummary}`
                : `A delivery partner has been assigned to pick up your returned items for order ${returnRequest.orderId?.orderId || ''}.${rItemsSummary}`,
            type: 'order',
            data: { returnRequestId: String(returnRequest._id) }
        });
    }

    // Notify vendor for replacement handover OTP
    if (isExchangeLeg2 && returnRequest.vendorId) {
        await createNotification({
            recipientId: returnRequest.vendorId,
            recipientType: 'vendor',
            title: 'Replacement pickup OTP generated',
            message: `A rider has accepted the replacement order for ${returnRequest.orderId?.orderId || ''}. Provide them with the Handover OTP to authorize pickup.${rItemsSummary}`,
            type: 'order',
            data: { returnRequestId: String(returnRequest._id) }
        });
    }

    return res.status(200).json(new ApiResponse(200, returnRequest, 'Offer accepted successfully.'));
});

// POST /api/delivery/returns/:id/reject
export const rejectReturnPickup = asyncHandler(async (req, res) => {
    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    });

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    if (returnRequest.deliveryAssignmentStatus !== 'assigned') {
        throw new ApiError(409, 'No active assignment offer found to reject.');
    }

    const isExchangeLeg2 = returnRequest.status === 'replacement_assigned';

    returnRequest.rejectedDeliveryBoys.push(req.user.id);
    returnRequest.deliveryBoyId = undefined;
    returnRequest.deliveryAssignmentStatus = 'pending';

    if (isExchangeLeg2) {
        returnRequest.status = 'replacement_ready';
        await returnRequest.save();
        notifyReturnUpdate(returnRequest);
        autoAssignExchangeReplacementPartner(returnRequest._id);
    } else {
        if (returnRequest.status === 'pickup_pending' || returnRequest.status === 'pickup_assigned') {
            returnRequest.status = 'approved';
        }
        await returnRequest.save();
        notifyReturnUpdate(returnRequest);
        autoAssignReturnPickupPartner(returnRequest._id);
    }

    return res.status(200).json(new ApiResponse(200, null, 'Offer rejected successfully. Re-routing.'));
});

// PATCH /api/delivery/returns/:id/status
export const updateReturnPickupStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['picked_up', 'delivered_to_vendor', 'out_for_delivery', 'completed'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    let returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    }).populate('orderId', 'orderId').populate('vendorId', 'storeName');

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    // Transition guards
    const transitionAllowed =
        (status === 'picked_up' && returnRequest.status === 'pickup_assigned') ||
        (status === 'delivered_to_vendor' && returnRequest.status === 'picked_up') ||
        (status === 'out_for_delivery' && returnRequest.status === 'replacement_assigned') ||
        (status === 'completed' && returnRequest.status === 'out_for_delivery');

    if (!transitionAllowed) {
        throw new ApiError(409, `Cannot move return status from ${returnRequest.status} to ${status}.`);
    }

    if (status === 'delivered_to_vendor' && !returnRequest.vendorHandoffOtpVerified) {
        throw new ApiError(400, 'Vendor must verify the handoff OTP on their dashboard to mark this return request as delivered.');
    }

    if (status === 'out_for_delivery' && !returnRequest.vendorHandoverOtpVerified) {
        throw new ApiError(400, 'Vendor Handover OTP must be verified before marking the replacement as picked up.');
    }

    if (status === 'completed' && !returnRequest.customerDeliveryOtpVerified) {
        throw new ApiError(400, 'Customer Delivery OTP must be verified before marking the replacement as completed.');
    }

    if (status === 'out_for_delivery') {
        const deliveryOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const deliveryHash = crypto.createHash('sha256').update(deliveryOtp).digest('hex');
        returnRequest.customerDeliveryOtpHash = deliveryHash;
        returnRequest.customerDeliveryOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        returnRequest.customerDeliveryOtpAttempts = 0;
        returnRequest.customerDeliveryOtpVerified = false;

        const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
        if (!isProduction) {
            returnRequest.customerDeliveryOtpDebug = deliveryOtp;
        }

        // Cleanup Vendor Handover OTP
        returnRequest.vendorHandoverOtpHash = null;
        returnRequest.vendorHandoverOtpExpiresAt = null;
        returnRequest.vendorHandoverOtpAttempts = 0;
        returnRequest.vendorHandoverOtpDebug = null;
    }

    if (status === 'completed') {
        // Cleanup Customer Delivery OTP
        returnRequest.customerDeliveryOtpHash = null;
        returnRequest.customerDeliveryOtpExpiresAt = null;
        returnRequest.customerDeliveryOtpAttempts = 0;
        returnRequest.customerDeliveryOtpDebug = null;
    }

    if (status === 'picked_up') {
        if (!returnRequest.returnPickupOtpVerified) {
            throw new ApiError(400, 'Customer OTP must be verified before marking the return as picked up.');
        }

        // Upload files
        const riderPickupPhotos = [];
        if (Array.isArray(req.files) && req.files.length > 0) {
            for (const file of req.files) {
                const uploaded = await uploadLocalFileToCloudinaryAndCleanup(file.path, 'returns/rider');
                if (uploaded) {
                    riderPickupPhotos.push({
                        url: uploaded.url,
                        public_id: uploaded.publicId || uploaded.public_id || ''
                    });
                }
            }
        }

        const evidenceRequiredReasons = [
            "Product Damaged",
            "Wrong Product Received",
            "Missing Parts or Accessories",
            "Product Not Matching Description",
            "Defective Product"
        ];
        const isEvidenceBased = evidenceRequiredReasons.includes(returnRequest.returnReason);
        if (isEvidenceBased && riderPickupPhotos.length === 0) {
            throw new ApiError(400, `At least one pickup photo is required as evidence for reason: ${returnRequest.returnReason}`);
        }

        returnRequest.riderPickupPhotos = riderPickupPhotos;

        // Generate Vendor Handoff OTP for when rider delivers back to shop
        const vendorOtp = Math.floor(100000 + Math.random() * 900000).toString();
        const vendorHash = crypto.createHash('sha256').update(vendorOtp).digest('hex');
        returnRequest.vendorHandoffOtpHash = vendorHash;
        returnRequest.vendorHandoffOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
        returnRequest.vendorHandoffOtpAttempts = 0;
        returnRequest.vendorHandoffOtpVerified = false;
        returnRequest.vendorHandoffOtpDebug = vendorOtp;
    }

    const isDeliveredToVendor = status === 'delivered_to_vendor';
    const isCompleted = status === 'completed';

    if (isDeliveredToVendor || isCompleted) {
        const session = await mongoose.startSession();
        try {
            await session.withTransaction(async () => {
                const payoutType = isDeliveredToVendor ? 'returnPickupPayoutProcessed' : 'replacementPayoutProcessed';
                const refPrefix = isDeliveredToVendor ? 'RETURN_PICKUP' : 'REPLACEMENT_DELIVERY';
                const payoutAmount = 40; // Flat fee for return/exchange legs

                // 1. Lock the payout atomically to prevent double payouts
                const updateQuery = { _id: returnRequest._id };
                updateQuery[payoutType] = { $ne: true };

                const updateFields = { status };
                updateFields[payoutType] = true;
                updateFields[payoutType + 'At'] = new Date();
                if (isDeliveredToVendor) {
                    updateFields.riderPickupPhotos = returnRequest.riderPickupPhotos;
                    updateFields.vendorHandoffOtpHash = returnRequest.vendorHandoffOtpHash;
                    updateFields.vendorHandoffOtpExpiresAt = returnRequest.vendorHandoffOtpExpiresAt;
                    updateFields.vendorHandoffOtpAttempts = returnRequest.vendorHandoffOtpAttempts;
                    updateFields.vendorHandoffOtpVerified = returnRequest.vendorHandoffOtpVerified;
                    updateFields.vendorHandoffOtpDebug = returnRequest.vendorHandoffOtpDebug;
                }

                const updateReturnResult = await ReturnRequest.updateOne(
                    updateQuery,
                    { $set: updateFields },
                    { session }
                );

                if (updateReturnResult.modifiedCount === 0) {
                    throw new Error('Payout already processed for this return leg.');
                }

                // 2. Fetch driver and get balances
                const boy = await DeliveryBoy.findById(req.user.id).session(session);
                if (!boy) throw new Error('Driver profile not found.');

                const walletBefore = boy.walletBalance;
                const cashBefore = boy.cashInHand;

                // 3. Update balances
                boy.walletBalance = parseFloat((boy.walletBalance + payoutAmount).toFixed(2));
                await boy.save({ session });

                // 4. Log ledger transaction
                await DeliveryWalletTransaction.create(
                    [{
                        deliveryBoyId: req.user.id,
                        type: 'DELIVERY_EARNING',
                        amount: payoutAmount,
                        referenceId: `${refPrefix}_PAYOUT_REQUEST_${returnRequest._id}`,
                        performedBy: { role: 'system' },
                        walletBalanceBefore: walletBefore,
                        walletBalanceAfter: boy.walletBalance,
                        cashInHandBefore: cashBefore,
                        cashInHandAfter: boy.cashInHand,
                        notes: `Earned ₹${payoutAmount} for completing ${refPrefix.toLowerCase().replace('_', ' ')} Leg`
                    }],
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }
        // Fetch fresh copy to notify socket properly
        const freshRequest = await ReturnRequest.findById(returnRequest._id);
        if (freshRequest) {
            returnRequest = freshRequest;
        }
    } else {
        returnRequest.status = status;
        await returnRequest.save();
    }
    notifyReturnUpdate(returnRequest);

    // Send notifications based on the new status
    const notificationTasks = [];
    const rItemsSummary = buildExchangeSummary(returnRequest);

    if (status === 'picked_up') {
        if (returnRequest.userId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.userId,
                    recipientType: 'user',
                    title: 'Return items picked up',
                    message: `Rider has picked up the return items for order ${returnRequest.orderId?.orderId || ''}.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
        if (returnRequest.vendorId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.vendorId,
                    recipientType: 'vendor',
                    title: 'Return shipment out for delivery',
                    message: `Rider has collected returned items for order ${returnRequest.orderId?.orderId || ''} and is delivering to your shop.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
    }

    if (status === 'delivered_to_vendor') {
        if (returnRequest.userId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.userId,
                    recipientType: 'user',
                    title: 'Returned items delivered to vendor',
                    message: `Rider has delivered the returned items for order ${returnRequest.orderId?.orderId || ''} to the vendor. Awaiting inspection.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
        if (returnRequest.vendorId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.vendorId,
                    recipientType: 'vendor',
                    title: 'Return items delivered',
                    message: `Returned items for order ${returnRequest.orderId?.orderId || ''} have been delivered to your shop. Please inspect and confirm receipt.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
    }

    if (status === 'out_for_delivery') {
        if (returnRequest.userId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.userId,
                    recipientType: 'user',
                    title: 'Replacement package out for delivery',
                    message: `Rider is on the way to deliver your replacement items for order ${returnRequest.orderId?.orderId || ''}.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
        if (returnRequest.vendorId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.vendorId,
                    recipientType: 'vendor',
                    title: 'Replacement package out with rider',
                    message: `Rider picked up replacement items for order ${returnRequest.orderId?.orderId || ''} and is heading to the customer.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
    }

    if (status === 'completed') {
        if (returnRequest.userId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.userId,
                    recipientType: 'user',
                    title: 'Exchange completed',
                    message: `Your replacement items for order ${returnRequest.orderId?.orderId || ''} have been successfully delivered.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
        if (returnRequest.vendorId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.vendorId,
                    recipientType: 'vendor',
                    title: 'Replacement delivered successfully',
                    message: `Replacement items for order ${returnRequest.orderId?.orderId || ''} have been delivered to the customer.${rItemsSummary}`,
                    type: 'order',
                    data: { returnRequestId: String(returnRequest._id), status }
                })
            );
        }
    }

    if (notificationTasks.length > 0) {
        await Promise.allSettled(notificationTasks);
    }

    return res.status(200).json(new ApiResponse(200, returnRequest, 'Status updated successfully.'));
});

// POST /api/delivery/returns/:id/verify-otp
export const verifyCustomerPickupOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    if (!otp) throw new ApiError(400, 'OTP is required.');

    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    });

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    if (returnRequest.returnPickupOtpAttempts >= 5) {
        throw new ApiError(400, 'OTP verification locked. Max incorrect attempts reached (5). Please ask the customer to resend OTP.');
    }

    if (!returnRequest.returnPickupOtpExpiresAt || Date.now() > new Date(returnRequest.returnPickupOtpExpiresAt)) {
        throw new ApiError(400, 'OTP has expired. Please ask the customer to request a new OTP.');
    }

    const hashedInput = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (hashedInput !== returnRequest.returnPickupOtpHash) {
        returnRequest.returnPickupOtpAttempts += 1;
        await returnRequest.save();
        notifyReturnUpdate(returnRequest);
        const remaining = 5 - returnRequest.returnPickupOtpAttempts;
        throw new ApiError(400, `Incorrect OTP. ${remaining} attempts remaining.`);
    }

    returnRequest.returnPickupOtpVerified = true;
    returnRequest.returnPickupOtpAttempts = 0;
    await returnRequest.save();
    notifyReturnUpdate(returnRequest);

    return res.status(200).json(new ApiResponse(200, { verified: true }, 'OTP verified successfully.'));
});

// POST /api/delivery/returns/:id/verify-vendor-handover-otp
export const verifyVendorHandoverOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    if (!otp) throw new ApiError(400, 'OTP is required.');

    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    });

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    if (returnRequest.vendorHandoverOtpAttempts >= 5) {
        throw new ApiError(400, 'OTP verification locked. Max incorrect attempts reached (5). Please ask the vendor to generate a new OTP.');
    }

    if (!returnRequest.vendorHandoverOtpExpiresAt || Date.now() > new Date(returnRequest.vendorHandoverOtpExpiresAt)) {
        throw new ApiError(400, 'OTP has expired. Please ask the vendor to generate a new OTP.');
    }

    const hashedInput = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (hashedInput !== returnRequest.vendorHandoverOtpHash) {
        returnRequest.vendorHandoverOtpAttempts += 1;
        await returnRequest.save();
        notifyReturnUpdate(returnRequest);
        const remaining = 5 - returnRequest.vendorHandoverOtpAttempts;
        throw new ApiError(400, `Incorrect OTP. ${remaining} attempts remaining.`);
    }

    returnRequest.vendorHandoverOtpVerified = true;
    returnRequest.vendorHandoverOtpAttempts = 0;
    await returnRequest.save();
    notifyReturnUpdate(returnRequest);

    return res.status(200).json(new ApiResponse(200, { verified: true }, 'Vendor Handover OTP verified successfully.'));
});

// POST /api/delivery/returns/:id/verify-customer-delivery-otp
export const verifyCustomerDeliveryOtp = asyncHandler(async (req, res) => {
    const { otp } = req.body;
    if (!otp) throw new ApiError(400, 'OTP is required.');

    const returnRequest = await ReturnRequest.findOne({
        _id: req.params.id,
        deliveryBoyId: req.user.id
    });

    if (!returnRequest) throw new ApiError(404, 'Return request not found.');

    if (returnRequest.customerDeliveryOtpAttempts >= 5) {
        throw new ApiError(400, 'OTP verification locked. Max incorrect attempts reached (5). Please ask the customer to generate a new OTP.');
    }

    if (!returnRequest.customerDeliveryOtpExpiresAt || Date.now() > new Date(returnRequest.customerDeliveryOtpExpiresAt)) {
        throw new ApiError(400, 'OTP has expired. Please ask the customer to generate a new OTP.');
    }

    const hashedInput = crypto.createHash('sha256').update(String(otp).trim()).digest('hex');
    if (hashedInput !== returnRequest.customerDeliveryOtpHash) {
        returnRequest.customerDeliveryOtpAttempts += 1;
        await returnRequest.save();
        notifyReturnUpdate(returnRequest);
        const remaining = 5 - returnRequest.customerDeliveryOtpAttempts;
        throw new ApiError(400, `Incorrect OTP. ${remaining} attempts remaining.`);
    }

    returnRequest.customerDeliveryOtpVerified = true;
    returnRequest.customerDeliveryOtpAttempts = 0;
    await returnRequest.save();
    notifyReturnUpdate(returnRequest);

    return res.status(200).json(new ApiResponse(200, { verified: true }, 'Customer Delivery OTP verified successfully.'));
});
