import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Product from '../src/models/Product.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const toVariantPriceEntries = (variantPrices) => {
    if (!variantPrices) return [];
    if (variantPrices instanceof Map) return Array.from(variantPrices.entries());
    if (typeof variantPrices === 'object') return Object.entries(variantPrices);
    return [];
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const product = await Product.findById("69c54d1cbc43573c4ed0afe0");
    console.log("product.variants:", JSON.stringify(product.variants, null, 2));
    console.log("toVariantPriceEntries(product.variants.prices):", toVariantPriceEntries(product.variants.prices));
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
};

run();
