import fetch from 'node-fetch';

async function testStats() {
    try {
        const response = await fetch('http://localhost:5002/api/v1/admin/stats');
        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Data:', data);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testStats();
