const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_URL = 'http://localhost:3000/api';

// Create a test token for a driver user
const testUserId = '507f1f77bcf86cd799439011'; // Example MongoDB ObjectId
const testToken = jwt.sign(
  { _id: testUserId },
  process.env.JWT_SECRET || 'your-super-secret-jwt-key-here',
  { expiresIn: '24h' }
);

console.log('Test token created:', testToken);

// Test cashout endpoint
async function testCashOut() {
  try {
    const response = await axios.post(
      `${API_URL}/wallet/cashout`,
      {
        amount: 100,
        bankCode: 'BDO',
        accountNumber: '123456789',
        accountHolderName: 'Test Driver'
      },
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('✅ Cashout request successful:', response.status, response.data);
  } catch (error) {
    console.error('❌ Cashout request failed:');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data?.error);
    console.error('Full response:', error.response?.data);
  }
}

testCashOut();
