import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../src/models/Product.model.js';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    const products = await Product.find().lean();
    console.log('Total products in DB:', products.length);
    products.forEach(p => {
      console.log(`- ID: ${p._id}, Name: ${p.name}, categoryId: ${p.categoryId}`);
    });
  } catch (err) {
    console.error('Failed to get products:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
