import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import ReturnRequest from '../../../models/ReturnRequest.model.js';
import Vendor from '../../../models/Vendor.model.js';
import Order from '../../../models/Order.model.js';
import crypto from 'crypto';
import { uploadLocalFileToCloudinaryAndCleanup } from '../../../services/upload.service.js';
import { createNotification } from '../../../services/notification.service.js';
import { autoAssignReturnPickupPartner, autoAssignExchangeReplacementPartner } from '../../../services/assignmentService.js';

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
    }
    await returnRequest.save();

    // Notify customer
    if (returnRequest.userId) {
        await createNotification({
            recipientId: returnRequest.userId,
            recipientType: 'user',
            title: isExchangeLeg2 ? 'Rider assigned for replacement delivery' : 'Rider assigned for return pickup',
            message: isExchangeLeg2
                ? `A delivery partner has been assigned to deliver your replacement items for order ${returnRequest.orderId?.orderId || ''}.`
                : `A delivery partner has been assigned to pick up your returned items for order ${returnRequest.orderId?.orderId || ''}.`,
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
        autoAssignExchangeReplacementPartner(returnRequest._id);
    } else {
        if (returnRequest.status === 'pickup_pending' || returnRequest.status === 'pickup_assigned') {
            returnRequest.status = 'approved';
        }
        await returnRequest.save();
        autoAssignReturnPickupPartner(returnRequest._id);
    }

    return res.status(200).json(new ApiResponse(200, null, 'Offer rejected successfully. Re-routing.'));
});

// PATCH /api/delivery/returns/:id/status
export const updateReturnPickupStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;
    const allowed = ['picked_up', 'delivered_to_vendor', 'out_for_delivery', 'completed'];
    if (!allowed.includes(status)) throw new ApiError(400, `Status must be one of: ${allowed.join(', ')}`);

    const returnRequest = await ReturnRequest.findOne({
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

    returnRequest.status = status;
    await returnRequest.save();

    // Send notifications based on the new status
    const notificationTasks = [];

    if (status === 'picked_up') {
        if (returnRequest.userId) {
            notificationTasks.push(
                createNotification({
                    recipientId: returnRequest.userId,
                    recipientType: 'user',
                    title: 'Return items picked up',
                    message: `Rider has picked up the return items for order ${returnRequest.orderId?.orderId || ''}.`,
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
                    message: `Rider has collected returned items for order ${returnRequest.orderId?.orderId || ''} and is delivering to your shop.`,
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
                    message: `Rider has delivered the returned items for order ${returnRequest.orderId?.orderId || ''} to the vendor. Awaiting inspection.`,
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
                    message: `Returned items for order ${returnRequest.orderId?.orderId || ''} have been delivered to your shop. Please inspect and confirm receipt.`,
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
                    message: `Rider is on the way to deliver your replacement items for order ${returnRequest.orderId?.orderId || ''}.`,
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
                    message: `Rider picked up replacement items for order ${returnRequest.orderId?.orderId || ''} and is heading to the customer.`,
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
                    message: `Your replacement items for order ${returnRequest.orderId?.orderId || ''} have been successfully delivered.`,
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
                    message: `Replacement items for order ${returnRequest.orderId?.orderId || ''} have been delivered to the customer.`,
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
        const remaining = 5 - returnRequest.returnPickupOtpAttempts;
        throw new ApiError(400, `Incorrect OTP. ${remaining} attempts remaining.`);
    }

    returnRequest.returnPickupOtpVerified = true;
    returnRequest.returnPickupOtpAttempts = 0;
    await returnRequest.save();

    return res.status(200).json(new ApiResponse(200, { verified: true }, 'OTP verified successfully.'));
});
