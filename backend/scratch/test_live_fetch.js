const runTest = async () => {
    try {
        console.log('Logging in...');
        const loginRes = await fetch('http://localhost:5000/api/delivery/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: 'delivery@delivery.com',
                password: 'delivery123'
            })
        });
        const loginData = await loginRes.json();
        const token = loginData.data.accessToken;
        console.log('Login successful. Token acquired.');

        console.log('\nFetching order details...');
        const orderRes = await fetch('http://localhost:5000/api/delivery/orders/ORD-1783423050771-NVS3', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });
        const orderData = await orderRes.json();
        console.log('API Response status:', orderRes.status);
        console.log('API Response status field:', orderData.data?.status);
        console.log('API Response deliveryOtpDebug:', orderData.data?.deliveryOtpDebug);
    } catch (err) {
        console.error('Error:', err.message);
    }
};

runTest();
