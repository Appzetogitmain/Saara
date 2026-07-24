import mongoose from 'mongoose';
import { ReturnRequest } from './src/models/ReturnRequest.model.js';

const testAuditLogCrash = async () => {
    console.log("=== RUNNING AUDIT LOG CRASH TEST ===\n");

    const req = new ReturnRequest({
        orderId: new mongoose.Types.ObjectId(),
        returnReason: 'Other',
    });

    const adminId = new mongoose.Types.ObjectId();

    req.statusHistory.push({
        status: 'pickup_assigned',
        changedAt: new Date(),
        notes: `[Manual Reassignment] test`,
        performedBy: adminId,  // WRONG KEY
        performedByName: 'Admin',
        performedByRole: 'admin'
    });

    try {
        await req.validate();
        console.log("❌ FAIL: Validation succeeded (this should not happen)");
    } catch (error) {
        console.log("✅ PASS: Validation failed exactly as expected.");
        console.log("Error:", error.errors['statusHistory.0.performedById']?.message || error.message);
    }
};

testAuditLogCrash();
