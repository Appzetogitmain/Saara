import Order from '../models/Order.model.js';
import DeliveryBoy from '../models/DeliveryBoy.model.js';
import DeliveryWalletTransaction from '../models/DeliveryWalletTransaction.model.js';

/**
 * Process delivery boy payout and COD cash collections atomically.
 * @param {string} orderId - The target order database ID
 * @param {string} deliveryBoyId - The assigned delivery boy database ID
 * @param {Object} session - The active MongoDB client session for transaction coordination
 */
export const processDeliveryBoyPayout = async (orderId, deliveryBoyId, session) => {
    // 1. Fetch the order inside the session to check its eligibility
    const order = await Order.findById(orderId).session(session);
    if (!order) {
        throw new Error('Order not found.');
    }

    if (order.deliveryPayoutProcessed) {
        throw new Error('Payout already processed for this order.');
    }

    // Align vendor sub-order statuses to 'delivered'
    const vendorItems = (order.vendorItems || []).map((vi) => {
        const current = String(vi?.status || 'pending');
        if (current === 'cancelled') return vi;
        return { ...vi.toObject(), status: 'delivered' };
    });

    // 2. Atomically mark order as payout processed and clear OTP details
    const updateOrderResult = await Order.updateOne(
        { 
            _id: orderId, 
            deliveryPayoutProcessed: { $ne: true } 
        },
        { 
            $set: { 
                status: 'delivered',
                deliveredAt: new Date(),
                vendorItems,
                deliveryPayoutProcessed: true, 
                deliveryPayoutProcessedAt: new Date(),
                deliveryOtpVerifiedAt: new Date(),
                deliveryOtpHash: undefined,
                deliveryOtpExpiry: undefined,
                deliveryOtpSentAt: undefined,
                deliveryOtpAttempts: 0,
                deliveryOtpDebug: undefined
            } 
        },
        { session }
    );

    if (updateOrderResult.modifiedCount === 0) {
        throw new Error('Payout already processed for this order.');
    }

    // 3. Calculate payout
    const calculateDeliveryPayout = (ord) => {
        let pay = 50; // Base pay
        const dist = ord.distance || 0;
        if (dist > 5) {
            pay += (dist - 5) * 5; // ₹5 per additional km
        }
        return parseFloat(pay.toFixed(2));
    };

    const payout = calculateDeliveryPayout(order);
    const isCod = order.paymentMethod === 'cash' || order.paymentMethod === 'cod';
    const cashAmount = isCod ? order.total : 0;

    // 4. Retrieve and update driver balances
    const boy = await DeliveryBoy.findById(deliveryBoyId).session(session);
    if (!boy) {
        throw new Error('Driver profile not found.');
    }

    const walletBefore = boy.walletBalance;
    const cashBefore = boy.cashInHand;

    // Update wallet balance for the earnings first
    boy.walletBalance = parseFloat((boy.walletBalance + payout).toFixed(2));
    
    // Create ledger entry for delivery earning
    await DeliveryWalletTransaction.create(
        [{
            deliveryBoyId,
            type: 'DELIVERY_EARNING',
            amount: payout,
            referenceId: `DELIVERY_EARNING_ORDER_${order._id}`,
            performedBy: { role: 'system' },
            orderId: order._id,
            walletBalanceBefore: walletBefore,
            walletBalanceAfter: boy.walletBalance,
            cashInHandBefore: cashBefore,
            cashInHandAfter: cashBefore, // Cash balance does not change during delivery earning
            notes: `Earned ₹${payout} for delivering Order #${order.orderId}`
        }],
        { session }
    );

    // If COD, update cash collected liability and create collection ledger
    if (isCod) {
        const walletAfterEarning = boy.walletBalance;
        boy.cashInHand = parseFloat((boy.cashInHand + cashAmount).toFixed(2));
        
        await DeliveryWalletTransaction.create(
            [{
                deliveryBoyId,
                type: 'COD_COLLECTION',
                amount: cashAmount,
                referenceId: `COD_COLLECTION_ORDER_${order._id}`,
                performedBy: { role: 'delivery_boy', id: deliveryBoyId },
                orderId: order._id,
                walletBalanceBefore: walletAfterEarning,
                walletBalanceAfter: walletAfterEarning,
                cashInHandBefore: cashBefore,
                cashInHandAfter: boy.cashInHand,
                notes: `Collected ₹${cashAmount} Cash on Delivery for Order #${order.orderId}`
            }],
            { session }
        );
    }

    await boy.save({ session });
};
