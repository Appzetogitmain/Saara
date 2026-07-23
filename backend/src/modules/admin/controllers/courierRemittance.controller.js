import asyncHandler from '../../../utils/asyncHandler.js';
import ApiResponse from '../../../utils/ApiResponse.js';
import ApiError from '../../../utils/ApiError.js';
import Shipment from '../../../models/Shipment.model.js';
import CourierCODRemittance from '../../../models/CourierCODRemittance.model.js';
import mongoose from 'mongoose';
import LogisticsEventBus from '../../../events/logisticsEventBus.js';
import LOGISTICS_EVENTS from '../../../events/logisticsEvents.js';

// GET /api/admin/courier-remittances/pending
export const getPendingCourierCod = asyncHandler(async (req, res) => {
    const { providerId } = req.query;

    const filter = {
        status: 'delivered',
        isCashSettled: false,
        providerId: { $ne: 'own_fleet' }
    };

    if (providerId) {
        filter.providerId = providerId;
    }

    // Need to find shipments where order is COD.
    // Let's use aggregate to join with orders.
    const pendingShipments = await Shipment.aggregate([
        { $match: filter },
        {
            $lookup: {
                from: 'orders',
                localField: 'orderId',
                foreignField: '_id',
                as: 'order'
            }
        },
        { $unwind: '$order' },
        {
            $match: {
                'order.paymentMethod': { $in: ['cod', 'cash'] }
            }
        },
        {
            $project: {
                _id: 1,
                shipmentNumber: 1,
                orderId: 1,
                vendorId: 1,
                providerId: 1,
                customerShippingCharge: 1,
                actualDeliveryCost: 1,
                deliveredAt: 1,
                orderTotal: '$order.total'
            }
        }
    ]);

    res.status(200).json(new ApiResponse(200, pendingShipments, 'Pending courier COD shipments fetched.'));
});

// POST /api/admin/courier-remittances/settle
export const settleCourierCod = asyncHandler(async (req, res) => {
    const { shipmentIds, amountReceived, providerId, referenceId, notes } = req.body;

    if (!shipmentIds || !Array.isArray(shipmentIds) || shipmentIds.length === 0) {
        throw new ApiError(400, 'Shipment IDs are required.');
    }
    if (!providerId) {
        throw new ApiError(400, 'Provider ID is required.');
    }
    if (amountReceived === undefined || amountReceived === null) {
        throw new ApiError(400, 'Amount received is required.');
    }

    const session = await mongoose.startSession();
    let settledShipments = [];

    try {
        await session.withTransaction(async () => {
            const shipments = await Shipment.aggregate([
                { $match: { _id: { $in: shipmentIds.map(id => new mongoose.Types.ObjectId(id)) } } },
                {
                    $lookup: {
                        from: 'orders',
                        localField: 'orderId',
                        foreignField: '_id',
                        as: 'order'
                    }
                },
                { $unwind: '$order' }
            ]).session(session);

            if (shipments.length !== shipmentIds.length) {
                throw new ApiError(404, 'One or more shipments not found.');
            }

            let expectedAmount = 0;
            shipments.forEach(s => {
                if (s.isCashSettled) throw new ApiError(400, `Shipment ${s.shipmentNumber} is already settled.`);
                if (s.providerId !== providerId) throw new ApiError(400, `Shipment ${s.shipmentNumber} does not match provider ${providerId}.`);
                if (!['cod', 'cash'].includes(s.order.paymentMethod)) throw new ApiError(400, `Shipment ${s.shipmentNumber} is not a COD order.`);
                
                expectedAmount += s.order.total;
                settledShipments.push(s);
            });

            // 1. Create Remittance Record
            const [remittance] = await CourierCODRemittance.create([{
                providerId,
                amountExpected: expectedAmount,
                amountReceived,
                remittanceStatus: 'received',
                referenceId: referenceId || `REMIT-${Date.now()}`,
                notes: notes || `Admin manually marked COD received for ${shipments.length} shipments.`,
                receivedAt: new Date()
            }], { session });

            // 2. Mark shipments as settled
            await Shipment.updateMany(
                { _id: { $in: shipmentIds.map(id => new mongoose.Types.ObjectId(id)) } },
                { 
                    $set: { 
                        isCashSettled: true,
                        cashSettlementId: remittance._id
                    } 
                },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    // 3. Emit COD_RECEIVED event for each shipment to unlock vendor escrow
    settledShipments.forEach(s => {
        LogisticsEventBus.emitEvent(LOGISTICS_EVENTS.COD_RECEIVED, {
            remittanceId: null,
            shipmentId: s._id,
            orderId: s.orderId,
            vendorId: s.vendorId,
            amountReceived: s.order.total, // per-shipment approximate
            providerId: s.providerId
        });
    });

    res.status(200).json(new ApiResponse(200, { settledCount: settledShipments.length }, 'Courier COD settled successfully.'));
});
