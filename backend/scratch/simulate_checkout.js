import axios from 'axios';

const runTest = async () => {
    try {
        console.log('1. Logging in as customer...');
        const loginRes = await axios.post('http://localhost:5000/api/user/auth/login', {
            email: 'test@gmail.com',
            password: '123456'
        });
        const token = loginRes.data.data.accessToken;
        console.log('Login successful. Token:', token.substring(0, 20) + '...');

        console.log('\n2. Placing a COD order...');
        const checkoutPayload = {
            items: [
                {
                    productId: '6a4754fe86ec58d5b3793fc1',
                    quantity: 1,
                    price: 5000
                }
            ],
            shippingAddress: {
                name: 'Test Customer',
                email: 'test@gmail.com',
                phone: '9876543210',
                address: '123 Test Street',
                city: 'Mumbai',
                state: 'Maharashtra',
                zipCode: '400001',
                country: 'India'
            },
            paymentMethod: 'cod',
            shippingOption: 'standard'
        };

        const checkoutRes = await axios.post('http://localhost:5000/api/user/orders', checkoutPayload, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        console.log('Checkout response:', JSON.stringify(checkoutRes.data, null, 2));
    } catch (err) {
        console.error('Error occurred:', err.response?.data || err.message);
    }
};

runTest();
