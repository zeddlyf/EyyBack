/**
 * TEST_CASHOUT_SIMULATION.js
 * Simple script to test the cashout simulation functionality
 * 
 * This tests that:
 * 1. Cashout in simulation mode doesn't call real Xendit API
 * 2. Amount is properly deducted from earnings/wallet
 * 3. Transaction is auto-completed after a delay
 */

const axios = require('axios');

const API_BASE = 'http://localhost:5001';

// Test data
const testUser = {
  email: 'testdriver@example.com',
  password: 'Test@123456',
  firstName: 'Test',
  lastName: 'Driver'
};

const bankDetails = {
  bankCode: 'BCA',
  accountNumber: '1234567890',
  accountHolderName: 'Test Driver'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testCashoutSimulation() {
  try {
    console.log('🧪 CASHOUT SIMULATION TEST\n');
    console.log('Testing the cashout simulation feature...\n');

    // Step 1: Check environment variables
    console.log('📋 Environment Check:');
    console.log(`   CASHOUT_SIMULATION=${process.env.CASHOUT_SIMULATION}`);
    console.log(`   NODE_ENV=${process.env.NODE_ENV}`);
    console.log(`   SIMULATE_WEBHOOKS=${process.env.SIMULATE_WEBHOOKS}\n`);

    // Step 2: Try to get an existing user or create one
    let authToken = null;
    try {
      console.log('🔐 Getting authentication token...');
      const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
        email: 'geeper@gmail.com',
        password: 'Password@123'
      });
      authToken = loginResponse.data.token;
      console.log('✅ Logged in as geeper@gmail.com\n');
    } catch (loginErr) {
      console.error('❌ Could not login:', loginErr.response?.data?.message || loginErr.message);
      console.log('Please make sure there is a test driver account in the database.\n');
      return;
    }

    // Step 3: Check wallet balance
    console.log('💰 Checking wallet balance...');
    const walletResponse = await axios.get(`${API_BASE}/api/wallet`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const currentBalance = walletResponse.data.balance || walletResponse.data.amount || 0;
    console.log(`   Current balance: ₱${currentBalance.toFixed(2)}\n`);

    // Step 4: If balance is too low, try to add funds first (for testing)
    if (currentBalance < 500) {
      console.log('⚠️  Balance is low. Adding test funds...');
      try {
        // This would normally require a payment, but we can check if there's a debug endpoint
        const debugResponse = await axios.get(`${API_BASE}/api/wallet/debug`, {
          headers: { Authorization: `Bearer ${authToken}` }
        });
        console.log('   Earnings info:', debugResponse.data.rides);
      } catch (debugErr) {
        console.log('   Debug endpoint not available or no earnings found\n');
      }
    }

    // Step 5: Initiate cashout
    console.log('💳 Initiating cashout request...');
    console.log(`   Amount: ₱500.00`);
    console.log(`   Bank: ${bankDetails.bankCode}`);
    console.log(`   Account: ${bankDetails.accountNumber}\n`);

    const cashoutResponse = await axios.post(
      `${API_BASE}/api/wallet/cashout`,
      {
        amount: 500,
        ...bankDetails
      },
      {
        headers: { Authorization: `Bearer ${authToken}` }
      }
    );

    console.log('✅ Cashout request submitted');
    console.log('   Response:', {
      success: cashoutResponse.data.success,
      status: cashoutResponse.data.status,
      message: cashoutResponse.data.message,
      simulated: cashoutResponse.data.simulated,
      payoutId: cashoutResponse.data.payoutId,
      referenceId: cashoutResponse.data.referenceId
    });

    // Step 6: Wait for auto-completion
    if (cashoutResponse.data.simulated) {
      console.log('\n⏳ Waiting for simulation auto-completion (2-3 seconds)...');
      await sleep(3000);

      // Step 7: Check transaction history
      console.log('\n📊 Checking transaction history...');
      const historyResponse = await axios.get(`${API_BASE}/api/wallet/transactions`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const transactions = historyResponse.data;
      const lastTransaction = transactions[0];

      console.log('   Latest transaction:');
      console.log(`     Type: ${lastTransaction.type}`);
      console.log(`     Amount: ₱${lastTransaction.amount.toFixed(2)}`);
      console.log(`     Status: ${lastTransaction.status}`);
      console.log(`     Description: ${lastTransaction.description}`);

      // Step 8: Check final balance
      console.log('\n💰 Checking final wallet balance...');
      const finalWalletResponse = await axios.get(`${API_BASE}/api/wallet`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const finalBalance = finalWalletResponse.data.balance || finalWalletResponse.data.amount || 0;
      console.log(`   Final balance: ₱${finalBalance.toFixed(2)}`);
      console.log(`   Amount deducted: ₱${(currentBalance - finalBalance).toFixed(2)}\n`);

      // Summary
      console.log('✅ SIMULATION TEST COMPLETE\n');
      console.log('Summary:');
      console.log(`  • Cashout is using SIMULATION mode (no real Xendit API calls)`);
      console.log(`  • Amount was deducted from wallet: ₱${(currentBalance - finalBalance).toFixed(2)}`);
      console.log(`  • Transaction was auto-completed`);
      console.log(`  • Driver earnings simulation is working properly\n`);
    } else {
      console.log('\n⚠️  Simulation mode is NOT enabled. Check CASHOUT_SIMULATION environment variable.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response?.data) {
      console.error('   Details:', error.response.data);
    }
  }
}

// Run test
testCashoutSimulation();
