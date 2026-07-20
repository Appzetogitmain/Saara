import mongoose from 'mongoose';
import 'dotenv/config';

// Define the connection string (assuming default local MongoDB or check .env)
const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb+srv://furqan:abcfrk123@cluster0.u1nsjtp.mongodb.net/';

mongoose.connect(uri)
  .then(async () => {
    const Product = mongoose.connection.collection('products');
    
    // Find SevenFriday Unisex
    const sevenFriday = await Product.findOne({ name: /SevenFriday/i });
    console.log("=== SEVENFRIDAY ===");
    if (sevenFriday) {
      console.log(JSON.stringify({
        name: sevenFriday.name,
        description: sevenFriday.description,
        tags: sevenFriday.tags,
        categoryId: sevenFriday.categoryId,
        brandId: sevenFriday.brandId,
      }, null, 2));
    } else {
      console.log("Not found");
    }

    // Find Nike Air Jordan Backpack
    const backpack = await Product.findOne({ name: /Nike Air Jordan/i });
    console.log("\n=== NIKE AIR JORDAN BACKPACK ===");
    if (backpack) {
      console.log(JSON.stringify({
        name: backpack.name,
        description: backpack.description,
        tags: backpack.tags,
        categoryId: backpack.categoryId,
        brandId: backpack.brandId,
      }, null, 2));
    } else {
      console.log("Not found");
    }

    process.exit(0);
  })
  .catch(err => {
    console.error("Connection error:", err);
    process.exit(1);
  });
