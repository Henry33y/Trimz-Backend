import fetch from 'node-fetch';

const test = async () => {
    try {
        const res = await fetch('http://localhost:5002/api/v1/admin/public/config');
        const data = await res.json();
        console.log('Public Config:', JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error:', err.message);
    }
};

test();
