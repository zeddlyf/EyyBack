const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function testCashOutFlow() {
  try {
    console.log('🚀 Testing Cash-Out Flow\n');

    // Step 1: Login
    console.log('📝 Step 1: Login as test driver...');
    const loginResponse = await axios.post(`${API_URL}/auth/login`, {
      email: 'testdriver@example.com',
      password: 'TestPassword123!'
    });

    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log('   Token:', token.substring(0, 20) + '...');
    console.log('   User:', loginResponse.data.user.firstName, loginResponse.data.user.lastName);
    console.log('   Role:', loginResponse.data.user.role);
    console.log('   Approval:', loginResponse.data.user.approvalStatus);

    // Step 2: Check wallet
    console.log('\n💰 Step 2: Check wallet balance...');
    const walletResponse = await axios.get(`${API_URL}/wallet`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    console.log('✅ Wallet retrieved');
    console.log('   Balance: ₱' + walletResponse.data.balance.toFixed(2));
    console.log('   Currency:', walletResponse.data.currency);

    // Step 3: Attempt cash-out
    console.log('\n💸 Step 3: Initiate cash-out (₱100)...');
    const cashoutResponse = await axios.post(
      `${API_URL}/wallet/cashout`,
      {
        amount: 100,
        bankCode: 'BDO',
        accountNumber: '123456789',
        accountHolderName: 'Test Driver'
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    console.log('✅ Cash-out initiated successfully!');
    console.log('   Payout ID:', cashoutResponse.data.payoutId);
    console.log('   Reference ID:', cashoutResponse.data.referenceId);
    console.log('   Status:', cashoutResponse.data.status);
    console.log('   Amount:', cashoutResponse.data.amount);
    console.log('   Fee:', cashoutResponse.data.fee);

    console.log('\n✅ All tests passed! Cash-out is working correctly.');
    console.log('\n📋 Summary:');
    console.log('   - Driver authenticated successfully');
    console.log('   - Wallet balance checked');
    console.log('   - Cash-out request processed');
    console.log('   - Ready for production testing');

  } catch (error) {
    console.error('\n❌ Test failed!');
    console.error('Status:', error.response?.status);
    console.error('Error:', error.response?.data?.error);
    console.error('Message:', error.response?.data?.message);
    if (error.response?.data) {
      console.error('Full response:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.message) {
      console.error('HTTP Error:', error.message);
    }
  }
}

testCashOutFlow();
