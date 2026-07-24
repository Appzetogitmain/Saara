import EventDispatcher from '../services/eventDispatcher.service.js';
import reverseEngine from '../services/reverseEngine.service.js';
import { autoAssignExchangeReplacementPartner } from '../services/assignmentService.js';

export const initializeEventRegistry = () => {
    // ─── Reverse Logistics Flow ───────────────────────────────────────────
    
    // Triggered when a Return Request is approved by Admin/Vendor
    EventDispatcher.register('RETURN_APPROVED', async (payload) => {
        const { returnRequestId } = payload;
        await reverseEngine.processReturn(returnRequestId);
    });

    // Triggered when an Exchange Replacement is ready
    EventDispatcher.register('REPLACEMENT_READY', async (payload) => {
        const { returnRequestId } = payload;
        // Temporary placeholder: currently calls the legacy Own Fleet assignment.
        // In future phases, this will trigger the Exchange Decision Engine.
        await autoAssignExchangeReplacementPartner(returnRequestId);
    });

    // Triggered when a reverse shipment receives a webhook update
    EventDispatcher.register('REVERSE_SHIPMENT_UPDATED', async (payload) => {
        const { returnRequestId, status, trackingNumber } = payload;
        
        // Map Shipment status to ReturnRequest business status
        const REVERSE_STATUS_MAPPING = {
            'processing': 'approved',
            'pickup_scheduled': 'pickup_assigned',
            'picked_up': 'picked_up',
            'in_transit': 'picked_up',
            'delivered': 'delivered_to_vendor'
        };

        const targetStatus = REVERSE_STATUS_MAPPING[status];
        if (!targetStatus) return; // 'failed' has no automatic business status change

        const ReturnRequest = (await import('../models/ReturnRequest.model.js')).default;
        const req = await ReturnRequest.findById(returnRequestId).populate('orderId');
        if (!req) return;

        if (req.status !== targetStatus) {
            const oldStatus = req.status;
            req.status = targetStatus;
            
            // Add audit log
            req.statusHistory.push({
                status: targetStatus,
                changedAt: new Date(),
                notes: `[System] Return Request status synchronized with logistics provider (Shipment Status: ${status}).`,
                performedByName: 'Webhook (System)',
                performedByRole: 'system'
            });

            await req.save();

            // Send notification
            const { createNotification } = await import('../services/notification.service.js');
            const notificationTasks = [];
            
            if (req.userId) {
                notificationTasks.push(
                    createNotification({
                        recipientId: req.userId,
                        recipientType: 'user',
                        title: 'Return Request Update',
                        message: `Your return request for order ${req.orderId?.orderId || req.orderId} is now ${targetStatus}. Tracking: ${trackingNumber || 'N/A'}.`,
                        type: 'order',
                        data: { returnRequestId: String(req._id), status: targetStatus }
                    })
                );
            }

            if (req.vendorId) {
                notificationTasks.push(
                    createNotification({
                        recipientId: req.vendorId,
                        recipientType: 'vendor',
                        title: 'Return Request Synchronized',
                        message: `Logistics status updated to ${status}. Return request marked as ${targetStatus}. Tracking: ${trackingNumber || 'N/A'}.`,
                        type: 'order',
                        data: { returnRequestId: String(req._id), status: targetStatus }
                    })
                );
            }

            if (notificationTasks.length > 0) {
                await Promise.allSettled(notificationTasks);
            }
        }
    });

    console.log('[EventRegistry] All event handlers registered successfully.');
};
