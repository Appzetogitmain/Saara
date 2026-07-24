process.env.RAZORPAY_KEY_ID = 'rzp_test_mock123456';
process.env.RAZORPAY_KEY_SECRET = 'mock_secret_123456';

import mongoose from 'mongoose';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_mock123456';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'mock_secret_123456';

import Order from './models/Order.model.js';
import Product from './models/Product.model.js';
import User from './models/User.model.js';
import Vendor from './models/Vendor.model.js';
import DeliveryBoy from './models/DeliveryBoy.model.js';
import ReturnRequest from './models/ReturnRequest.model.js';

import * as userOrderController from './modules/user/controllers/order.controller.js';
import * as vendorReturnController from './modules/vendor/controllers/return.controller.js';
import * as deliveryReturnController from './modules/delivery/controllers/return.controller.js';

async function runExchangeTestSuite() {
  const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/saara';
  console.log('Connecting to MongoDB at:', MONGO_URI);
  await mongoose.connect(MONGO_URI);

  try {
    console.log('\n==================================================');
    console.log('STARTING COMPLETE MULTI-VENDOR EXCHANGE TEST SUITE');
    console.log('==================================================\n');

    let user = await User.findOne({ role: 'user' }) || await User.findOne({});
    let vendor = await Vendor.findOne({ status: 'approved' }) || await Vendor.findOne({});
    let deliveryBoy = await DeliveryBoy.findOne({ isAvailable: true }) || await DeliveryBoy.findOne({});

    if (!user || !vendor || !deliveryBoy) {
      throw new Error(`Test environment missing entities: User=${!!user}, Vendor=${!!vendor}, DeliveryBoy=${!!deliveryBoy}`);
    }

    console.log(`✓ Test User: ${user.name} (${user._id})`);
    console.log(`✓ Test Vendor: ${vendor.storeName || vendor.name} (${vendor._id})`);
    console.log(`✓ Test Rider: ${deliveryBoy.name} (${deliveryBoy._id})`);

    // 2. Find or create a Product with multi-variant stock
    let product = await Product.findOne({ vendorId: vendor._id, isActive: true });
    if (!product) {
      product = await Product.create({
        name: 'Test Exchange T-Shirt',
        vendorId: vendor._id,
        price: 999,
        stock: 50,
        isActive: true,
        variants: {
          sizes: ['S', 'M', 'L'],
          colors: ['Red', 'Blue', 'Black'],
          stockMap: {
            'S|Red': 10,
            'M|Red': 10,
            'L|Red': 10,
            'S|Blue': 10,
            'M|Blue': 10,
          }
        }
      });
    } else {
      product.variants = {
        sizes: ['S', 'M', 'L'],
        colors: ['Red', 'Blue', 'Black'],
        stockMap: {
          'S|Red': 10,
          'M|Red': 10,
          'L|Red': 10,
          'S|Blue': 10,
          'M|Blue': 10,
        }
      };
      await product.save();
    }

    console.log(`✓ Test Product: ${product.name} (${product._id})`);

    // 3. Create Delivered Order with Purchased Variant (S | Red)
    const orderId = `TEST_EXCHANGE_ORD_${Date.now()}`;
    const mockOrder = await Order.create({
      orderId,
      userId: user._id,
      vendorId: vendor._id,
      items: [
        {
          productId: product._id,
          name: product.name,
          quantity: 1,
          price: 999,
          vendorId: vendor._id,
          variant: { size: 'S', color: 'Red' },
          variantKey: 'S|Red'
        }
      ],
      shippingAddress: {
        name: 'Test Customer',
        phone: '9876543210',
        address: '123 Main St, Bangalore',
        city: 'Bangalore',
        state: 'Karnataka',
        zipCode: '560001'
      },
      paymentMethod: 'upi',
      paymentStatus: 'paid',
      subtotal: 999,
      total: 999,
      status: 'delivered'
    });

    console.log(`✓ Delivered Order Created: #${mockOrder.orderId} (${mockOrder._id})`);

    // 4. STEP 1: USER SUBMITS EXCHANGE REQUEST (Swap S|Red for M|Blue)
    console.log('\n--- STEP 1: User Submitting Exchange Request (S|Red -> M|Blue) ---');
    const reqSubmit = {
      params: { id: mockOrder._id.toString() },
      user: { id: user._id.toString(), role: 'user' },
      body: {
        returnReason: 'Wrong Size',
        customReason: '',
        vendorId: vendor._id.toString(),
        requestType: 'exchange',
        exchangeSize: 'M',
        exchangeColor: 'Blue',
        exchangeVariantJson: JSON.stringify({ size: 'M', color: 'Blue' }),
        itemsJson: JSON.stringify([{ productId: product._id.toString(), quantity: 1 }])
      },
      files: []
    };

    let createdReturnId = null;
    const resSubmit = {
      status(code) { this.statusCode = code; return this; },
      json(data) {
        if (data && data.data) createdReturnId = data.data._id || data.data.id;
        return data;
      }
    };

    await userOrderController.createReturnRequest(reqSubmit, resSubmit);
    
    if (!createdReturnId) {
      throw new Error('Exchange request creation failed - no return ID returned');
    }

    let returnReq = await ReturnRequest.findById(createdReturnId);
    console.log(`✓ ReturnRequest created with ID: ${returnReq._id}`);
    console.log(`  - Type: ${returnReq.requestType}`);
    console.log(`  - Status: ${returnReq.status}`);
    console.log(`  - Requested Variant:`, returnReq.exchangeDetails?.requestedVariant);

    if (returnReq.requestType !== 'exchange') throw new Error('Expected requestType to be exchange');
    if (returnReq.exchangeDetails?.requestedVariant?.size !== 'M') throw new Error('Expected requested size M');
    if (returnReq.exchangeDetails?.requestedVariant?.color !== 'Blue') throw new Error('Expected requested color Blue');

    // 5. STEP 2: VENDOR APPROVES EXCHANGE REQUEST
    console.log('\n--- STEP 2: Vendor Approving Exchange Request ---');
    returnReq.deliveryBoyId = deliveryBoy._id;
    returnReq.deliveryAssignmentStatus = 'assigned';
    await returnReq.save();

    const reqVendorApprove = {
      params: { id: returnReq._id.toString() },
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { status: 'approved' }
    };
    const resVendorApprove = {
      status(code) { this.statusCode = code; return this; },
      json(data) { return data; }
    };

    await vendorReturnController.updateVendorReturnRequestStatus(reqVendorApprove, resVendorApprove);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Vendor Approved Exchange. Status: ${returnReq.status}, Delivery Status: ${returnReq.deliveryAssignmentStatus}`);

    // 6. STEP 3: RIDER ACCEPTS & PROCESSES RETURN PICKUP (Leg 1)
    console.log('\n--- STEP 3: Rider Accepting & Completing Return Pickup (Leg 1) ---');
    const reqRiderAccept1 = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' }
    };
    const resRiderAccept1 = {
      status(code) { this.statusCode = code; return this; },
      json(data) { return data; }
    };
    await deliveryReturnController.acceptReturnPickup(reqRiderAccept1, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Rider accepted pickup offer. Status: ${returnReq.status}`);
    console.log(`✓ Customer Pickup OTP Debug: ${returnReq.returnPickupOtpDebug}`);

    // Verify Customer Pickup OTP
    const reqVerifyOtp1 = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { otp: returnReq.returnPickupOtpDebug }
    };
    await deliveryReturnController.verifyCustomerPickupOtp(reqVerifyOtp1, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Customer OTP verified! returnPickupOtpVerified: ${returnReq.returnPickupOtpVerified}`);

    // Mark Picked Up
    const reqMarkPickedUp = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { status: 'picked_up' },
      files: []
    };
    await deliveryReturnController.updateReturnPickupStatus(reqMarkPickedUp, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Rider marked Picked Up! Status: ${returnReq.status}`);
    console.log(`✓ Generated Vendor Handoff OTP Debug: ${returnReq.vendorHandoffOtpDebug}`);

    // Vendor Verifies Handoff OTP & Rider Marks Delivered to Vendor
    returnReq.vendorHandoffOtpVerified = true;
    await returnReq.save();

    const reqDeliveredVendor = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { status: 'delivered_to_vendor' }
    };
    await deliveryReturnController.updateReturnPickupStatus(reqDeliveredVendor, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Items Delivered to Vendor Shop! Status: ${returnReq.status}`);

    // 7. STEP 4: VENDOR MARKS REPLACEMENT READY (Leg 2 Trigger)
    console.log('\n--- STEP 4: Vendor Marking Replacement Package Ready ---');
    const reqReplacementReady = {
      params: { id: returnReq._id.toString() },
      user: { id: vendor._id.toString(), role: 'vendor' },
      body: { status: 'replacement_ready' }
    };
    await vendorReturnController.updateVendorReturnRequestStatus(reqReplacementReady, resVendorApprove);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Vendor marked Replacement Ready! Status: ${returnReq.status}`);

    // 8. STEP 5: RIDER ACCEPTS & DELIVERS REPLACEMENT PACKAGE (Leg 2)
    console.log('\n--- STEP 5: Rider Delivering Replacement Package to Customer ---');
    returnReq.deliveryBoyId = deliveryBoy._id;
    returnReq.deliveryAssignmentStatus = 'assigned';
    returnReq.status = 'replacement_assigned';
    await returnReq.save();

    await deliveryReturnController.acceptReturnPickup(reqRiderAccept1, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Rider accepted replacement delivery offer. Status: ${returnReq.status}`);
    console.log(`✓ Generated Vendor Handover OTP Debug: ${returnReq.vendorHandoverOtpDebug}`);

    // Verify Vendor Handover OTP
    const reqVerifyVendorHandover = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { otp: returnReq.vendorHandoverOtpDebug }
    };
    await deliveryReturnController.verifyVendorHandoverOtp(reqVerifyVendorHandover, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Vendor Handover OTP verified! vendorHandoverOtpVerified: ${returnReq.vendorHandoverOtpVerified}`);

    // Mark Out For Delivery
    const reqOutForDelivery = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { status: 'out_for_delivery' }
    };
    await deliveryReturnController.updateReturnPickupStatus(reqOutForDelivery, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Replacement package Out for Delivery! Status: ${returnReq.status}`);
    console.log(`✓ Generated Customer Delivery OTP Debug: ${returnReq.customerDeliveryOtpDebug}`);

    // Verify Customer Delivery OTP
    const reqVerifyCustomerDelivery = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { otp: returnReq.customerDeliveryOtpDebug }
    };
    await deliveryReturnController.verifyCustomerDeliveryOtp(reqVerifyCustomerDelivery, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);
    console.log(`✓ Customer Delivery OTP verified! customerDeliveryOtpVerified: ${returnReq.customerDeliveryOtpVerified}`);

    // Mark Replacement Completed
    const reqCompleted = {
      params: { id: returnReq._id.toString() },
      user: { id: deliveryBoy._id.toString(), role: 'delivery' },
      body: { status: 'completed' }
    };
    await deliveryReturnController.updateReturnPickupStatus(reqCompleted, resRiderAccept1);
    returnReq = await ReturnRequest.findById(returnReq._id);

    console.log(`\n==================================================`);
    console.log(`🎉 EXCHANGE WORKFLOW TEST COMPLETED SUCCESSFULLY! 🎉`);
    console.log(`- Final Status: ${returnReq.status}`);
    console.log(`- Leg 1 Payout Processed (Return): ${returnReq.returnPickupPayoutProcessed}`);
    console.log(`- Leg 2 Payout Processed (Replacement): ${returnReq.replacementPayoutProcessed}`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error('❌ EXCHANGE TEST SUITE FAILED:', err);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected.');
  }
}

runExchangeTestSuite();
