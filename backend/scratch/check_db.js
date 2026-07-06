import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB successfully.");
    
    // Find all vendors in DB
    const vendors = await Vendor.find({});
    console.log("Available Vendors in DB:");
    for (const v of vendors) {
      console.log(`- Vendor ID: ${v._id}, Store Name: ${v.storeName}`);
    }

    const p = await Product.findOne({ name: "GUCCI MENS WALLET" });
    if (p) {
      console.log("\nGUCCI MENS WALLET raw document:");
      console.log(JSON.stringify(p.toObject(), null, 2));
    } else {
      console.log("GUCCI MENS WALLET not found");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
