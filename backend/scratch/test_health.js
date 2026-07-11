import http from 'http';

const checkHealth = () => {
    const req = http.get('http://localhost:5000/health', (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log('STATUS:', res.statusCode);
            console.log('HEADERS:', JSON.stringify(res.headers));
            console.log('BODY:', data);
        });
    });

    req.on('error', (e) => {
        console.error('CONNECTION ERROR:', e.message);
    });
};

checkHealth();
