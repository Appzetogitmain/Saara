import axios from 'axios';

const runTest = async () => {
    try {
        console.log('Logging in...');
        const loginRes = await axios.post('http://localhost:5000/api/delivery/auth/login', {
            email: 'delivery@delivery.com',
            password: 'delivery123'
        });
        const token = loginRes.data.data.accessToken;
        console.log('Login successful. Token:', token);

        console.log('\nFetching order details...');
        const orderRes = await axios.get('http://localhost:5000/api/delivery/orders/ORD-1783423050771-NVS3', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        console.log('API Response:', JSON.stringify(orderRes.data, null, 2));
    } catch (err) {
        console.error('Error:', err.response?.data || err.message);
    }
};

runTest();
