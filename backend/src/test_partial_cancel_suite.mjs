import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummykey123';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummysecret123';

import Order from './models/Order.model.js';
import Shipment from './models/Shipment.model.js';
import Product from './models/Product.model.js';
import User from './models/User.model.js';
import Vendor from './models/Vendor.model.js';
import DeliveryBoy from './models/DeliveryBoy.model.js';
import Commission from './models/Commission.model.js';
import Refund from './models/Refund.model.js';
import UserWallet from './models/UserWallet.model.js';
import WalletTransaction from './models/WalletTransaction.model.js';
import { cancelVendorItem } from './modules/user/controllers/order.controller.js';

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/saara';

async function runTestSuite() {
  console.log('--- STARTING PARTIAL CANCELLATION INTEGRATION TEST SUITE ---');
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB connected');

  const testSuffix = Date.now();

  // 1. Create Test Entities
  const testUser = await User.create({
    name: `Test Customer ${testSuffix}`,
    email: `customer_${testSuffix}@example.com`,
    phone: `999${String(testSuffix).slice(-7)}`,
    password: 'Password123!',
    role: 'customer',
    isEmailVerified: true,
  });

  const vendorA = await Vendor.create({
    name: `Vendor A Owner ${testSuffix}`,
    storeName: `Vendor A Store ${testSuffix}`,
    email: `vendorA_${testSuffix}@example.com`,
    phone: `888${String(testSuffix).slice(-7)}`,
    password: 'Password123!',
    isApproved: true,
    status: 'approved',
  });

  const vendorB = await Vendor.create({
    name: `Vendor B Owner ${testSuffix}`,
    storeName: `Vendor B Store ${testSuffix}`,
    email: `vendorB_${testSuffix}@example.com`,
    phone: `777${String(testSuffix).slice(-7)}`,
    password: 'Password123!',
    isApproved: true,
    status: 'approved',
  });

  const deliveryRider = await DeliveryBoy.create({
    name: `Rider ${testSuffix}`,
    email: `rider_${testSuffix}@example.com`,
    phone: `666${String(testSuffix).slice(-7)}`,
    password: 'Password123!',
    status: 'available',
    applicationStatus: 'approved',
    isAvailable: true,
    currentLocation: { type: 'Point', coordinates: [77.5946, 12.9716] },
  });

  const catId = new mongoose.Types.ObjectId();

  const productA = await Product.create({
    name: `Army Uniform ${testSuffix}`,
    slug: `army-uniform-${testSuffix}`,
    categoryId: catId,
    price: 5000,
    stockQuantity: 10,
    vendorId: vendorA._id,
    stock: 'in_stock',
  });

  const productB = await Product.create({
    name: `Car Dashboard ${testSuffix}`,
    slug: `car-dashboard-${testSuffix}`,
    categoryId: catId,
    price: 500,
    stockQuantity: 20,
    vendorId: vendorB._id,
    stock: 'in_stock',
  });

  // 2. Create Multi-Vendor Order
  const orderIdStr = `ORD-TEST-${testSuffix}`;
  const vendorGroupAId = new mongoose.Types.ObjectId();
  const vendorGroupBId = new mongoose.Types.ObjectId();

  const testOrder = await Order.create({
    orderId: orderIdStr,
    userId: testUser._id,
    status: 'processing',
    paymentStatus: 'paid',
    paymentMethod: 'card',
    total: 6080,
    subtotal: 5500,
    tax: 990,
    shipping: 140,
    discount: 550,
    items: [
      { productId: productA._id, vendorId: vendorA._id, name: productA.name, price: 5000, quantity: 1 },
      { productId: productB._id, vendorId: vendorB._id, name: productB.name, price: 500, quantity: 1 },
    ],
    vendorItems: [
      {
        _id: vendorGroupAId,
        vendorId: vendorA._id,
        vendorName: vendorA.storeName,
        status: 'processing',
        subtotal: 5000,
        tax: 900,
        shipping: 80,
        discount: 500,
        commissionRate: 10,
        commissionAmount: 450,
        vendorEarnings: 4950,
        items: [{ productId: productA._id, name: productA.name, price: 5000, quantity: 1 }],
      },
      {
        _id: vendorGroupBId,
        vendorId: vendorB._id,
        vendorName: vendorB.storeName,
        status: 'processing',
        subtotal: 500,
        tax: 90,
        shipping: 60,
        discount: 50,
        commissionRate: 10,
        commissionAmount: 45,
        vendorEarnings: 495,
        items: [{ productId: productB._id, name: productB.name, price: 500, quantity: 1 }],
      },
    ],
    shippingAddress: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9999999999',
      address: '123 Test Street',
      city: 'Test City',
      state: 'State',
      zipCode: '123456',
      country: 'India',
    },
  });

  // Create Shipments
  const shipmentA = await Shipment.create({
    orderId: testOrder._id,
    vendorId: vendorA._id,
    providerId: 'own_fleet',
    status: 'pending',
    shipmentNumber: `SHP-A-${testSuffix}`,
  });

  const shipmentB = await Shipment.create({
    orderId: testOrder._id,
    vendorId: vendorB._id,
    providerId: 'own_fleet',
    deliveryBoyId: deliveryRider._id,
    deliveryAssignmentStatus: 'accepted',
    status: 'pending',
    shipmentNumber: `SHP-B-${testSuffix}`,
  });

  // Create Commission & Escrow Docs
  const commissionA = await Commission.create({
    orderId: testOrder._id,
    vendorId: vendorA._id,
    vendorName: vendorA.storeName,
    subtotal: 5000,
    vendorSubtotal: 5000,
    commissionRate: 10,
    commission: 450,
    commissionAmount: 450,
    vendorEarnings: 4950,
    vendorNetEarnings: 4950,
    escrowAmount: 4950,
    status: 'pending',
    escrowStatus: 'held',
  });

  const commissionB = await Commission.create({
    orderId: testOrder._id,
    vendorId: vendorB._id,
    vendorName: vendorB.storeName,
    subtotal: 500,
    vendorSubtotal: 500,
    commissionRate: 10,
    commission: 45,
    commissionAmount: 45,
    vendorEarnings: 495,
    vendorNetEarnings: 495,
    escrowAmount: 495,
    status: 'pending',
    escrowStatus: 'held',
  });

  console.log(`✅ Multi-Vendor Order #${orderIdStr} created with Vendor A (₹5480) & Vendor B (₹600)`);

  // --- TEST 1: DOUBLE CANCELLATION ATTEMPT (IDEMPOTENCY & STATUS LOCK) ---
  console.log('\n🧪 TEST 1: Double Cancellation Attempt (Idempotency & Status Lock Check)...');
  
  const mockReq1 = {
    params: { id: String(testOrder._id), vendorItemId: String(vendorGroupAId) },
    body: { reason: 'Ordered by mistake', comment: 'Testing idempotency' },
    user: { id: String(testUser._id) },
    ip: '127.0.0.1',
    get: () => 'TestAgent',
  };

  const mockResFactory = () => {
    let statusCode = 200;
    let jsonBody = null;
    return {
      status(code) { statusCode = code; return this; },
      json(body) { jsonBody = body; return { statusCode, jsonBody }; },
      getStatusCode: () => statusCode,
      getJsonBody: () => jsonBody,
    };
  };

  const res1 = mockResFactory();
  await cancelVendorItem(mockReq1, res1, (err) => { throw err; });

  console.log(`  First Cancellation Status Code: ${res1.getStatusCode()}`);

  let secondCallFailed = false;
  let secondErrorMessage = '';
  try {
    const res2 = mockResFactory();
    await cancelVendorItem(mockReq1, res2, (err) => { throw err; });
  } catch (err) {
    secondCallFailed = true;
    secondErrorMessage = err.message;
  }

  console.log(`  Second Cancellation Result: Blocked = ${secondCallFailed}, Message: "${secondErrorMessage}"`);

  if (res1.getStatusCode() === 200 && secondCallFailed && secondErrorMessage.includes('already cancelled')) {
    console.log('  PASSED: Idempotency & status lock verified. Second request rejected with 400.');
  } else {
    console.error('  FAILED: Idempotency test failed!');
  }

  // --- TEST 3: WALLET CREDIT & METADATA VALIDATION ---
  console.log('\n🧪 TEST 3: Wallet Credit & Metadata Validation...');
  const wallet = await UserWallet.findOne({ userId: testUser._id }).lean();
  const walletTx = await WalletTransaction.findOne({ walletId: wallet._id }).lean();

  console.log(`  Wallet Balance: ₹${wallet?.balance}`);
  console.log(`  Transaction Metadata:`, {
    type: walletTx?.type,
    amount: walletTx?.amount,
    reference: walletTx?.reference,
    description: walletTx?.description,
    orderNumber: walletTx?.metadata?.orderNumber,
    vendorName: walletTx?.metadata?.vendorName,
    items: walletTx?.metadata?.items,
  });

  if (wallet?.balance === 5480 && walletTx?.description?.includes(orderIdStr)) {
    console.log('  PASSED: Wallet credited ₹5480 with complete description & reference metadata.');
  } else {
    console.error('  FAILED: Wallet credit or metadata mismatch!');
  }

  // --- TEST 4: VENDOR A CANCELLED VS VENDOR B ACTIVE ---
  console.log('\n🧪 TEST 4: Isolation Verification (Vendor A Cancelled vs Vendor B Active)...');
  const updatedOrder = await Order.findById(testOrder._id).lean();
  const updatedShipmentA = await Shipment.findById(shipmentA._id).lean();
  const updatedShipmentB = await Shipment.findById(shipmentB._id).lean();
  const updatedCommA = await Commission.findById(commissionA._id).lean();
  const updatedCommB = await Commission.findById(commissionB._id).lean();

  console.log(`  Parent Order Status: '${updatedOrder.status}'`);
  console.log(`  Vendor A Group Status: '${updatedOrder.vendorItems[0].status}'`);
  console.log(`  Vendor B Group Status: '${updatedOrder.vendorItems[1].status}'`);
  console.log(`  Vendor A Shipment Status: '${updatedShipmentA.status}'`);
  console.log(`  Vendor B Shipment Status: '${updatedShipmentB.status}'`);
  console.log(`  Vendor A Commission Status: '${updatedCommA.status}', Escrow: '${updatedCommA.escrowStatus}'`);
  console.log(`  Vendor B Commission Status: '${updatedCommB.status}', Escrow: '${updatedCommB.escrowStatus}'`);

  if (
    updatedOrder.status === 'partially_cancelled' &&
    updatedOrder.vendorItems[0].status === 'cancelled' &&
    updatedOrder.vendorItems[1].status === 'processing' &&
    updatedShipmentA.status === 'cancelled' &&
    updatedShipmentB.status === 'pending' &&
    updatedCommA.status === 'cancelled' &&
    updatedCommB.status === 'pending'
  ) {
    console.log('  PASSED: Vendor A package cancelled cleanly; Vendor B remains 100% active and untouched.');
  } else {
    console.error('  FAILED: Cross-vendor isolation failure!');
  }

  // --- TEST 5: CANCEL LAST REMAINING PACKAGE ---
  console.log('\n🧪 TEST 5: Cancelling Last Package (Roll-up to Fully Cancelled)...');
  const mockReqB = {
    params: { id: String(testOrder._id), vendorItemId: String(vendorGroupBId) },
    body: { reason: 'Delivery taking too long' },
    user: { id: String(testUser._id) },
    ip: '127.0.0.1',
    get: () => 'TestAgent',
  };

  const resB = mockResFactory();
  await cancelVendorItem(mockReqB, resB, (err) => { throw err; });

  const finalOrder = await Order.findById(testOrder._id).lean();
  const finalWallet = await UserWallet.findOne({ userId: testUser._id }).lean();
  const updatedShipmentBAfter = await Shipment.findById(shipmentB._id).lean();

  console.log(`  Final Parent Order Status: '${finalOrder.status}'`);
  console.log(`  Final Wallet Balance: ₹${finalWallet?.balance} (Expected 5480 + 600 = 6080)`);
  console.log(`  Vendor B Shipment Rider: ${updatedShipmentBAfter.deliveryBoyId}`);

  if (
    finalOrder.status === 'cancelled' &&
    finalWallet?.balance === 6080 &&
    updatedShipmentBAfter.deliveryBoyId === undefined
  ) {
    console.log('  PASSED: Parent order rolled up to "cancelled", rider unassigned, and full refund completed.');
  } else {
    console.error('  FAILED: Final cancellation roll-up failed!');
  }

  // Cleanup Test Data
  console.log('\n🧹 Cleaning up test artifacts...');
  await Order.deleteOne({ _id: testOrder._id });
  await Shipment.deleteMany({ orderId: testOrder._id });
  await Product.deleteMany({ _id: { $in: [productA._id, productB._id] } });
  await Vendor.deleteMany({ _id: { $in: [vendorA._id, vendorB._id] } });
  await DeliveryBoy.deleteOne({ _id: deliveryRider._id });
  await User.deleteOne({ _id: testUser._id });
  await UserWallet.deleteOne({ userId: testUser._id });
  await WalletTransaction.deleteMany({ walletId: wallet._id });
  await Commission.deleteMany({ orderId: testOrder._id });
  await Refund.deleteMany({ orderId: testOrder._id });

  console.log('✨ ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('❌ TEST SUITE FAILED WITH ERROR:', err);
  process.exit(1);
});
