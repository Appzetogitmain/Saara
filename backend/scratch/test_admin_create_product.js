import 'dotenv/config';
import connectDB from '../src/config/db.js';
import mongoose from 'mongoose';
import { createProduct } from '../src/modules/admin/controllers/catalog.controller.js';
import Product from '../src/models/Product.model.js';
import Vendor from '../src/models/Vendor.model.js';
import Category from '../src/models/Category.model.js';

const testAdminProductCreation = async () => {
    await connectDB();
    console.log('Connected to database.');

    // 1. Create a mock Category
    const mockCategory = await Category.create({
        name: `Test Category ${Date.now()}`,
        slug: `test-cat-${Date.now()}`,
    });
    console.log('Created mock Category:', mockCategory._id);

    // 2. Call createProduct controller with NO vendorId in request body
    const req = {
        body: {
            name: `Admin Product ${Date.now()}`,
            price: 299,
            stockQuantity: 15,
            categoryId: mockCategory._id.toString(),
            description: 'Test product created by admin',
        }
    };

    let statusCalled = null;
    let jsonResponse = null;
    const res = {
        status: function(code) {
            statusCalled = code;
            return this;
        },
        json: function(data) {
            jsonResponse = data;
            return this;
        }
    };

    console.log('\n--- Creating Admin Product ---');
    await createProduct(req, res);
    console.log('Response Status:', statusCalled);

    if (statusCalled !== 201) {
        throw new Error(`Expected status 201, got ${statusCalled}`);
    }

    const createdProduct = jsonResponse.data;
    console.log('Created Product ID:', createdProduct._id);
    console.log('Assigned Vendor ID:', createdProduct.vendorId);

    // 3. Verify in database
    const dbProduct = await Product.findById(createdProduct._id).populate('vendorId');
    console.log('\n--- Verifying in DB ---');
    console.log('Product Name:', dbProduct.name);
    console.log('Vendor Email:', dbProduct.vendorId?.email);
    console.log('Vendor Store Name:', dbProduct.vendorId?.storeName);

    if (dbProduct.vendorId?.email !== 'admin@admin.com') {
        throw new Error(`Expected default admin vendor email admin@admin.com, got ${dbProduct.vendorId?.email}`);
    }
    console.log('Validation: PASS ✅');

    // Cleanup
    console.log('\nCleaning up mock data...');
    await Product.deleteOne({ _id: dbProduct._id });
    await Category.deleteOne({ _id: mockCategory._id });
    // We keep the admin vendor for future use but clean up if needed
    console.log('Cleanup complete.');

    await mongoose.disconnect();
    process.exit(0);
};

testAdminProductCreation().catch(async (e) => {
    console.error('Test Error:', e);
    await mongoose.disconnect();
    process.exit(1);
});
