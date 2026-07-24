import mongoose from 'mongoose';
import { ReturnRequest } from './src/models/ReturnRequest.model.js';

const testSchema = async () => {
    const dummyOrderId = new mongoose.Types.ObjectId();
    const validUserId = new mongoose.Types.ObjectId();

    console.log("=== RUNNING SCENARIO TESTS ===\n");

    // Helper to test validation
    const testValidation = async (scenarioName, historyItem, expectedSuccess) => {
        const req = new ReturnRequest({
            orderId: dummyOrderId,
            returnReason: 'Other',
            statusHistory: [historyItem]
        });

        try {
            await req.validate();
            if (expectedSuccess) {
                console.log(`✅ PASS: ${scenarioName} (Validation succeeded as expected)`);
            } else {
                console.log(`❌ FAIL: ${scenarioName} (Expected failure, but validation succeeded)`);
            }
        } catch (error) {
            if (expectedSuccess) {
                console.log(`❌ FAIL: ${scenarioName} (Expected success, but validation failed: ${error.message})`);
            } else {
                console.log(`✅ PASS: ${scenarioName} (Validation failed as expected: ${error.errors['statusHistory.0.performedById']?.message || error.message})`);
            }
        }
    };

    // 1. admin with valid ID
    await testValidation(
        "1. performedByRole = 'admin' with valid performedById",
        { status: 'approved', performedByRole: 'admin', performedById: validUserId, performedByName: 'Admin User' },
        true
    );

    // 2. admin with no ID
    await testValidation(
        "2. performedByRole = 'admin' with no performedById",
        { status: 'approved', performedByRole: 'admin', performedByName: 'Admin User' },
        false
    );

    // 3. system with no ID
    await testValidation(
        "3. performedByRole = 'system' with no performedById",
        { status: 'picked_up', performedByRole: 'system', performedByName: 'Webhook (System)' },
        true
    );

    // 4. system with null ID
    await testValidation(
        "4. performedByRole = 'system' with performedById = null",
        { status: 'picked_up', performedByRole: 'system', performedById: null, performedByName: 'Webhook (System)' },
        true
    );

    // 5. Existing human-generated audit entries
    await testValidation(
        "5. Existing human-generated audit entry (Vendor)",
        { status: 'rejected', performedByRole: 'vendor', performedById: new mongoose.Types.ObjectId(), performedByName: 'Store Owner' },
        true
    );
};

testSchema();
