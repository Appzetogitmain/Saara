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
    if (vendors.length === 0) {
      console.log("No vendors found in DB to re-assign to!");
      return;
    }
    
    const targetVendor = vendors[0]; // Let's use the first vendor as fallback
    console.log(`Fallback Vendor will be: ID: ${targetVendor._id}, Store Name: ${targetVendor.storeName}`);

    const products = await Product.find({});
    let updatedCount = 0;
    
    for (const p of products) {
      // Check if vendor exists
      const vendorExists = p.vendorId ? await Vendor.exists({ _id: p.vendorId }) : false;
      if (!vendorExists) {
        console.log(`Product "${p.name}" has invalid vendor: ${p.vendorId}. Re-assigning to ${targetVendor.storeName}...`);
        p.vendorId = targetVendor._id;
        await p.save();
        updatedCount++;
      }
    }
    
    console.log(`Finished. Updated ${updatedCount} products.`);
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
