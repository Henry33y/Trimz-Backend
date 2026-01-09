import fetch from 'node-fetch';

async function testProviders() {
    try {
        const response = await fetch('http://localhost:5002/api/v1/admin/providers');
        console.log('Status:', response.status);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testProviders();
