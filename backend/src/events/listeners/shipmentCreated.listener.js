/**
 * Listener: SHIPMENT_CREATED
 *
 * Fires whenever a new Shipment document is created (after transaction commit).
 *
 * ─── Phase 5.2 (current) ────────────────────────────────────────────────────
 * own_fleet: Triggers autoAssignDeliveryPartner(shipmentId) — assigns a
 * delivery partner to the Shipment. Shipment is the primary source of truth;
 * Order.deliveryBoyId is dual-written for backward compatibility only.
 *
 * ─── Phase 6 (later) ────────────────────────────────────────────────────────
 * courier providers: createShipment() called at vendor ready_for_pickup so
 * the courier is only booked when the vendor confirms the order is packed.
 *
 * ─── Payload ────────────────────────────────────────────────────────────────
 * {
 *   shipmentId:     string   (Shipment MongoDB ObjectId)
 *   shipmentNumber: string   (e.g., SHP-2026-XXXXX-YYYY)
 *   orderId:        string   (Order MongoDB ObjectId)
 *   orderNumber:    string   (e.g., ORD-2026-XXXXX-YYYY)
 *   vendorId:       string
 *   providerId:     string   ('own_fleet' | 'shiprocket' | ...)
 *   selectedBy:     string   ('AUTO' | 'ADMIN' | 'MANUAL_OVERRIDE')
 * }
 *
 * ─── Failure Isolation ──────────────────────────────────────────────────────
 * Failures inside this listener are caught and logged.
 * They NEVER propagate to the emitter — the order placement flow must not fail
 * because of a listener error.
 */

import LOGISTICS_EVENTS from '../logisticsEvents.js';
import { autoAssignDeliveryPartner } from '../../services/assignmentService.js';

const shipmentCreatedListener = (payload) => {
    try {
        const {
            shipmentId,
            shipmentNumber,
            orderId,
            orderNumber,
            vendorId,
            providerId,
            selectedBy,
        } = payload || {};

        console.log(
            `[${LOGISTICS_EVENTS.SHIPMENT_CREATED}] Received:`,
            `shipment=${shipmentNumber}`,
            `order=${orderNumber}`,
            `providerId=${providerId}`,
            `selectedBy=${selectedBy}`
        );

        if (providerId === 'own_fleet') {
            // Phase 5.2: Trigger Shipment-primary auto-assignment.
            // Fire-and-forget — failure is logged inside autoAssignDeliveryPartner.
            // Do NOT await here; the order placement response must not be blocked.
            console.log(
                `[${LOGISTICS_EVENTS.SHIPMENT_CREATED}]`,
                `Own fleet shipment ${shipmentNumber} — triggering driver assignment (Phase 5.2).`
            );
            autoAssignDeliveryPartner(shipmentId).catch(err => {
                console.error(
                    `[${LOGISTICS_EVENTS.SHIPMENT_CREATED}] Assignment error for Shipment ${shipmentNumber}:`,
                    err.message
                );
            });
        } else {
            // Courier provider: no-op at order placement.
            // Courier shipment booking happens at vendor ready_for_pickup (Phase 6).
            console.log(
                `[${LOGISTICS_EVENTS.SHIPMENT_CREATED}]`,
                `Courier shipment ${shipmentNumber} (provider=${providerId}) — no-op until vendor marks ready_for_pickup (Phase 6).`
            );
        }

    } catch (err) {
        // CRITICAL: Listener failures must NEVER propagate to the emitter.
        // Log and swallow — the order placement flow must not fail because of a listener.
        console.error(`[${LOGISTICS_EVENTS.SHIPMENT_CREATED}] Listener error:`, err.message);
    }
};

export default shipmentCreatedListener;
export { shipmentCreatedListener };
