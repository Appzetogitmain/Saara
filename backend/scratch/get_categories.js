import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../src/models/Category.model.js';

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    console.error('MONGO_URI is not set in environment');
    process.exit(1);
  }
  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB');

  try {
    const categories = await Category.find().lean();
    console.log('Total categories in DB:', categories.length);
    categories.forEach(cat => {
      console.log(`- ID: ${cat._id}, Name: ${cat.name}, parentId: ${cat.parentId} (type: ${typeof cat.parentId})`);
    });
  } catch (err) {
    console.error('Failed to get categories:', err.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

main();
