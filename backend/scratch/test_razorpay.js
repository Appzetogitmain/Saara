import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
    const { createRazorpayOrder } = await import('../src/services/payment.service.js');
    try {
        console.log('Testing Razorpay order creation...');
        console.log('Key ID:', process.env.RAZORPAY_KEY_ID);
        const order = await createRazorpayOrder(100, 'INR', 'TEST_RECEIPT_123');
        console.log('SUCCESS! Razorpay Order Created:', order);
    } catch (error) {
        console.error('RAZORPAY ERROR:', error);
    }
};

run();
