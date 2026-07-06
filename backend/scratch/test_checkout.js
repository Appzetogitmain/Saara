import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../src/models/Product.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB successfully.");

    const productId = "69c54d1cbc43573c4ed0afe0";
    const product = await Product.findById(productId);
    console.log("Product found:", product ? product.name : "NOT FOUND");
    if (product) {
      console.log("Product stock status:", product.stock);
      console.log("Product stock quantity:", product.stockQuantity);
      
      const baseFilter = {
        _id: product._id,
        stock: { $ne: 'out_of_stock' },
        stockQuantity: { $gte: 1 }
      };

      console.log("Base Filter:", baseFilter);
      const matched = await Product.findOne(baseFilter);
      console.log("Product matched with filter:", matched ? "YES" : "NO");
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
