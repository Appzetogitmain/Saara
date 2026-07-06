import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import ReturnRequest from '../src/models/ReturnRequest.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB successfully.");

    const pickedUpRequests = await ReturnRequest.find({
      status: 'picked_up'
    });

    console.log(`Found ${pickedUpRequests.length} picked_up return requests.`);
    for (const req of pickedUpRequests) {
      const otp = "123456";
      const hash = crypto.createHash('sha256').update(otp).digest('hex');
      req.vendorHandoffOtpHash = hash;
      req.vendorHandoffOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
      req.vendorHandoffOtpAttempts = 0;
      req.vendorHandoffOtpDebug = otp;
      req.vendorHandoffOtpVerified = false;
      await req.save({ validateBeforeSave: false });
      console.log(`Updated Request ID: ${req._id} with Test Vendor Handoff OTP: 123456`);
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
