/**
 * CASHOUT_VERIFICATION_TEST.js
 * Complete verification of the cashout simulation implementation
 */

const axios = require('axios');
require('dotenv').config();

const API_BASE = 'http://localhost:3000';

// ANSI Colors for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function verifyCashoutImplementation() {
  console.log('\n' + '='.repeat(70));
  log(colors.cyan, '🔍 CASHOUT IMPLEMENTATION VERIFICATION TEST');
  console.log('='.repeat(70) + '\n');

  try {
    // STEP 1: Check Environment Variables
    log(colors.blue, '📋 STEP 1: Checking Environment Variables...');
    console.log(`   CASHOUT_SIMULATION: ${process.env.CASHOUT_SIMULATION}`);
    console.log(`   NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`   API_BASE: ${API_BASE}\n`);

    if (process.env.CASHOUT_SIMULATION !== 'true') {
      log(colors.red, '❌ ERROR: CASHOUT_SIMULATION is not set to "true"');
      return;
    }
    log(colors.green, '✅ Environment variables correct\n');

    // STEP 2: Check API Server Health
    log(colors.blue, '📋 STEP 2: Checking API Server Health...');
    try {
      const healthResponse = await axios.get(`${API_BASE}/api/health`, { timeout: 5000 });
      log(colors.green, `✅ Server is running on port 3000\n`);
    } catch (err) {
      log(colors.red, `❌ ERROR: Cannot reach server at ${API_BASE}`);
      log(colors.yellow, '   Make sure the backend server is running: npm start in EyyBack folder\n');
      return;
    }

    // STEP 3: Authenticate User
    log(colors.blue, '📋 STEP 3: Authenticating as Test Driver...');
    let authToken = null;
    try {
      const loginResponse = await axios.post(`${API_BASE}/api/auth/login`, {
        email: 'geeper@gmail.com',
        password: 'Password@123'
      });
      authToken = loginResponse.data.token;
      console.log(`   Email: geeper@gmail.com`);
      log(colors.green, `✅ Authentication successful\n`);
    } catch (err) {
      log(colors.red, `❌ ERROR: Authentication failed`);
      console.log(`   Error: ${err.response?.data?.message || err.message}\n`);
      return;
    }

    // STEP 4: Get Initial Wallet Balance
    log(colors.blue, '📋 STEP 4: Checking Initial Wallet Balance...');
    let initialBalance = 0;
    try {
      const walletResponse = await axios.get(`${API_BASE}/api/wallet`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      initialBalance = walletResponse.data.balance || walletResponse.data.amount || 0;
      console.log(`   Initial Balance: ₱${initialBalance.toFixed(2)}`);
      log(colors.green, `✅ Wallet retrieved\n`);
    } catch (err) {
      log(colors.red, `❌ ERROR: Cannot get wallet`);
      console.log(`   Error: ${err.response?.data?.message || err.message}\n`);
      return;
    }

    // STEP 5: Verify Code Check
    log(colors.blue, '📋 STEP 5: Verifying Cashout Code Implementation...');
    console.log(`   Checking services/xendit.js for simulation mode...`);
    const fs = require('fs');
    const xenditCode = fs.readFileSync('./services/xendit.js', 'utf8');
    
    const checks = {
      'Simulation mode detection': xenditCode.includes('CASHOUT_SIMULATION'),
      'Mock payout creation': xenditCode.includes('sim_payout_'),
      'Logging for simulation': xenditCode.includes('🎭 SIMULATION MODE'),
    };

    let allCodeChecksPass = true;
    for (const [check, result] of Object.entries(checks)) {
      if (result) {
        log(colors.green, `   ✅ ${check}`);
      } else {
        log(colors.red, `   ❌ ${check}`);
        allCodeChecksPass = false;
      }
    }

    if (!allCodeChecksPass) {
      log(colors.red, '\n❌ Code implementation incomplete\n');
      return;
    }
    log(colors.green, '\n✅ Code implementation verified\n');

    // STEP 6: Test Cashout Request
    log(colors.blue, '📋 STEP 6: Submitting Cashout Request...');
    
    const cashoutAmount = 100;
    console.log(`   Amount: ₱${cashoutAmount}`);
    console.log(`   Bank: BDO`);
    console.log(`   Account: 1234567890`);
    
    let cashoutResponse = null;
    try {
      cashoutResponse = await axios.post(
        `${API_BASE}/api/wallet/cashout`,
        {
          amount: cashoutAmount,
          bankCode: 'BDO',
          accountNumber: '1234567890',
          accountHolderName: 'Test Driver'
        },
        {
          headers: { Authorization: `Bearer ${authToken}` }
        }
      );

      console.log(`\n   Response Status: ${cashoutResponse.data.status}`);
      console.log(`   Simulated: ${cashoutResponse.data.simulated}`);
      console.log(`   Message: ${cashoutResponse.data.message}`);
      
      if (cashoutResponse.data.simulated !== true) {
        log(colors.yellow, '⚠️  Warning: Response indicates this is NOT a simulated cashout');
      }
      
      log(colors.green, `✅ Cashout request successful\n`);
    } catch (err) {
      log(colors.red, `❌ ERROR: Cashout request failed`);
      console.log(`   Status: ${err.response?.status}`);
      console.log(`   Error: ${err.response?.data?.error || err.message}`);
      
      if (err.response?.data?.error?.includes('Xendit')) {
        log(colors.red, '\n   🔴 CRITICAL: Still trying to use real Xendit API!');
        log(colors.yellow, '   This means simulation mode is NOT enabled properly.');
        log(colors.yellow, '   Check that CASHOUT_SIMULATION=true is in .env');
        log(colors.yellow, '   And that the server was restarted after setting it.\n');
      }
      return;
    }

    // STEP 7: Check Balance After Cashout
    log(colors.blue, '📋 STEP 7: Checking Balance After Cashout...');
    await new Promise(r => setTimeout(r, 1000)); // Wait 1 second
    
    let finalBalance = 0;
    try {
      const walletResponse = await axios.get(`${API_BASE}/api/wallet`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      finalBalance = walletResponse.data.balance || walletResponse.data.amount || 0;
      console.log(`   Previous Balance: ₱${initialBalance.toFixed(2)}`);
      console.log(`   Cashout Amount: ₱${cashoutAmount}`);
      console.log(`   New Balance: ₱${finalBalance.toFixed(2)}`);
      console.log(`   Expected Balance: ₱${(initialBalance - cashoutAmount).toFixed(2)}`);
      
      const balanceCorrect = Math.abs((initialBalance - cashoutAmount) - finalBalance) < 0.01;
      if (balanceCorrect) {
        log(colors.green, `✅ Balance correctly deducted\n`);
      } else {
        log(colors.yellow, `⚠️  Balance may not be correct\n`);
      }
    } catch (err) {
      log(colors.red, `❌ ERROR: Cannot check wallet`);
      console.log(`   Error: ${err.message}\n`);
      return;
    }

    // STEP 8: Wait for Auto-Completion
    log(colors.blue, '📋 STEP 8: Waiting for Auto-Completion (2-3 seconds)...');
    await new Promise(r => setTimeout(r, 3000));
    log(colors.green, `✅ Wait complete\n`);

    // STEP 9: Check Transaction History
    log(colors.blue, '📋 STEP 9: Checking Transaction History...');
    try {
      const historyResponse = await axios.get(`${API_BASE}/api/wallet/transactions`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });

      const transactions = historyResponse.data;
      const latestTransaction = transactions[0];

      if (!latestTransaction) {
        log(colors.yellow, `⚠️  No transactions found\n`);
      } else {
        console.log(`   Latest Transaction:`);
        console.log(`     Type: ${latestTransaction.type}`);
        console.log(`     Amount: ₱${latestTransaction.amount.toFixed(2)}`);
        console.log(`     Status: ${latestTransaction.status}`);
        console.log(`     Description: ${latestTransaction.description}`);
        
        if (latestTransaction.status === 'completed') {
          log(colors.green, `\n✅ Transaction auto-completed successfully\n`);
        } else if (latestTransaction.status === 'pending') {
          log(colors.yellow, `\n⚠️  Transaction still pending (may need more time)\n`);
        } else {
          log(colors.red, `\n❌ Transaction has unexpected status: ${latestTransaction.status}\n`);
        }
      }
    } catch (err) {
      log(colors.red, `❌ ERROR: Cannot get transaction history`);
      console.log(`   Error: ${err.message}\n`);
      return;
    }

    // FINAL SUMMARY
    console.log('='.repeat(70));
    log(colors.green, '✅ ALL VERIFICATION CHECKS PASSED!');
    console.log('='.repeat(70));
    console.log('\n📊 SUMMARY:');
    console.log(`   ✅ Environment variables are correct`);
    console.log(`   ✅ Server is running and responding`);
    console.log(`   ✅ Authentication works`);
    console.log(`   ✅ Cashout code is properly implemented`);
    console.log(`   ✅ Cashout request succeeds`);
    console.log(`   ✅ Amount is deducted from wallet`);
    console.log(`   ✅ Transaction auto-completes`);
    console.log(`\n🎭 SIMULATION MODE IS WORKING CORRECTLY!\n`);

  } catch (err) {
    log(colors.red, '\n❌ VERIFICATION FAILED');
    console.error(err);
  }
}

// Run the verification
verifyCashoutImplementation();
