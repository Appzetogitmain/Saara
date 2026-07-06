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

    const activeRequests = await ReturnRequest.find({
      status: { $in: ['approved', 'pickup_pending', 'pickup_assigned'] }
    });

    console.log(`Found ${activeRequests.length} active return requests.`);
    for (const req of activeRequests) {
      if (!req.returnPickupOtpHash) {
        const otp = "123456";
        const hash = crypto.createHash('sha256').update(otp).digest('hex');
        req.returnPickupOtpHash = hash;
        req.returnPickupOtpExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours for testing
        req.returnPickupOtpAttempts = 0;
        req.returnPickupOtpDebug = otp;
        if (!req.returnReason) {
          req.returnReason = "Other";
        }
        await req.save({ validateBeforeSave: false });
        console.log(`Updated Request ID: ${req._id} with Test OTP: 123456`);
      }
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
