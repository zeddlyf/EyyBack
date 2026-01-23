#!/usr/bin/env node
/**
 * Cashout 403 Error Diagnostic and Fix Script
 * 
 * This script helps diagnose and fix 403 errors on cashout requests.
 * It checks:
 * 1. User role and approval status
 * 2. Wallet balance
 * 3. Bank code validity
 * 4. Xendit API connectivity
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { isSupportedBank, validateBankDetails, getBankChannelCode } = require('../utils/bankCodes');
require('dotenv').config();

const args = process.argv.slice(2);
const command = args[0];
const email = args[1];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }
    await mongoose.connect(uri);
    log('✅ Connected to MongoDB', 'green');
    return true;
  } catch (error) {
    log(`❌ Failed to connect to MongoDB: ${error.message}`, 'red');
    return false;
  }
}

async function checkUserCashoutEligibility(email) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      log(`❌ User not found with email: ${email}`, 'red');
      return null;
    }

    log(`\n📋 User Information:`, 'cyan');
    log(`   Email: ${user.email}`, 'blue');
    log(`   Name: ${user.firstName} ${user.lastName}`, 'blue');
    log(`   Role: ${user.role}`, 'blue');
    log(`   Approval Status: ${user.approvalStatus}`, 'blue');
    log(`   ID: ${user._id}`, 'blue');
    log(`   Created: ${user.createdAt}`, 'blue');

    // Check role
    log(`\n🔍 Role Check:`, 'cyan');
    if (user.role !== 'driver') {
      log(`   ❌ ISSUE: User is '${user.role}' but must be 'driver' for cashout`, 'red');
      log(`   Fix: Update user role to 'driver'`, 'yellow');
    } else {
      log(`   ✅ User role is correct (driver)`, 'green');
    }

    // Check approval status
    log(`\n🔍 Approval Status Check:`, 'cyan');
    if (user.approvalStatus !== 'approved') {
      log(`   ⚠️  User approval status is '${user.approvalStatus}' (pending approval)`, 'yellow');
      log(`   Note: Approval check is currently disabled in backend, but may be enforced later`, 'yellow');
    } else {
      log(`   ✅ User approval status is correct`, 'green');
    }

    // Check wallet
    log(`\n💰 Wallet Check:`, 'cyan');
    const wallet = await Wallet.findByUserId(user._id);
    if (wallet) {
      log(`   Balance: ₱${wallet.balance.toFixed(2)}`, 'blue');
      log(`   Currency: ${wallet.currency}`, 'blue');
      log(`   Transactions: ${wallet.transactions.length}`, 'blue');
      if (wallet.balance > 0) {
        log(`   ✅ Wallet has sufficient balance`, 'green');
      } else {
        log(`   ⚠️  Wallet balance is zero or negative`, 'yellow');
      }
    } else {
      log(`   ⚠️  No wallet found (will be created on first cashout)`, 'yellow');
    }

    // Eligibility summary
    log(`\n📊 Cashout Eligibility Summary:`, 'cyan');
    const isEligible = user.role === 'driver';
    if (isEligible) {
      log(`   ✅ User is ELIGIBLE for cashout`, 'green');
      return {
        eligible: true,
        user,
        wallet,
        issues: user.approvalStatus !== 'approved' ? ['Approval pending'] : []
      };
    } else {
      log(`   ❌ User is NOT ELIGIBLE for cashout`, 'red');
      return {
        eligible: false,
        user,
        wallet,
        issues: [`Role must be 'driver', current: '${user.role}'`]
      };
    }

  } catch (error) {
    log(`❌ Error checking user: ${error.message}`, 'red');
    return null;
  }
}

async function validateBankDetailsTest(bankCode, accountNumber, accountHolderName) {
  log(`\n🏦 Bank Details Validation:`, 'cyan');
  log(`   Bank Code: ${bankCode}`, 'blue');
  log(`   Account Number: ${accountNumber.slice(-4).padStart(accountNumber.length, '*')}`, 'blue');
  log(`   Account Holder: ${accountHolderName}`, 'blue');

  // Check if bank is supported
  const isSupported = isSupportedBank(bankCode);
  if (!isSupported) {
    log(`   ❌ Bank code '${bankCode}' is NOT supported`, 'red');
    log(`   Available banks: BPI, BDO, METROBANK, PNB, RCBC, UNIONBANK, LANDBANK, GCASH, PAYMAYA, etc.`, 'yellow');
    return false;
  } else {
    log(`   ✅ Bank code '${bankCode}' is supported`, 'green');
    
    try {
      const channelCode = getBankChannelCode(bankCode);
      log(`   ✅ Xendit Channel Code: ${channelCode}`, 'green');
    } catch (error) {
      log(`   ❌ Error getting channel code: ${error.message}`, 'red');
      return false;
    }
  }

  // Validate complete bank details
  const validation = validateBankDetails({ bankCode, accountNumber, accountHolderName });
  if (!validation.valid) {
    log(`   ❌ Validation failed: ${validation.error}`, 'red');
    return false;
  } else {
    log(`   ✅ All bank details are valid`, 'green');
    return true;
  }
}

async function testXenditConnection() {
  log(`\n🌐 Xendit API Connection Test:`, 'cyan');
  
  const apiKey = process.env.XENDIT_API_KEY;
  if (!apiKey) {
    log(`   ❌ XENDIT_API_KEY not set in environment variables`, 'red');
    return false;
  }

  if (apiKey.length < 10) {
    log(`   ❌ XENDIT_API_KEY appears invalid (too short)`, 'red');
    return false;
  }

  log(`   ✅ XENDIT_API_KEY is configured`, 'green');
  log(`   Key starts with: ${apiKey.substring(0, 10)}...`, 'blue');
  
  // Try a simple API call
  try {
    const axios = require('axios');
    const basic = Buffer.from(`${apiKey}:`).toString('base64');
    
    const response = await axios.get('https://api.xendit.co/balance', {
      headers: {
        'Authorization': `Basic ${basic}`
      },
      timeout: 5000
    });
    
    log(`   ✅ Xendit API is accessible`, 'green');
    log(`   Balance endpoint responded: ${response.status}`, 'blue');
    return true;
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      log(`   ❌ Xendit API returned ${error.response.status} - Check API key validity`, 'red');
    } else {
      log(`   ⚠️  Could not verify Xendit connectivity: ${error.message}`, 'yellow');
    }
    return false;
  }
}

async function simulateCashoutRequest(user, bankCode, amount = 500) {
  log(`\n🧪 Simulating Cashout Request:`, 'cyan');
  log(`   Amount: ₱${amount}`, 'blue');
  log(`   Bank: ${bankCode}`, 'blue');
  log(`   User: ${user.email}`, 'blue');

  // Step 1: Role check
  log(`\n   Step 1: Role Check`, 'blue');
  if (user.role !== 'driver') {
    log(`      ❌ FAIL - User is '${user.role}', must be 'driver'`, 'red');
    return false;
  }
  log(`      ✅ PASS - User is driver`, 'green');

  // Step 2: Bank validation
  log(`\n   Step 2: Bank Validation`, 'blue');
  const isSupported = isSupportedBank(bankCode);
  if (!isSupported) {
    log(`      ❌ FAIL - Bank code '${bankCode}' not supported`, 'red');
    return false;
  }
  log(`      ✅ PASS - Bank is supported`, 'green');

  // Step 3: Get Xendit channel code
  log(`\n   Step 3: Channel Code Conversion`, 'blue');
  try {
    const channelCode = getBankChannelCode(bankCode);
    log(`      ✅ PASS - ${bankCode} → ${channelCode}`, 'green');
  } catch (error) {
    log(`      ❌ FAIL - ${error.message}`, 'red');
    return false;
  }

  // Step 4: Balance check
  log(`\n   Step 4: Balance Check`, 'blue');
  const wallet = await Wallet.findByUserId(user._id);
  if (!wallet || wallet.balance < amount) {
    const balance = wallet?.balance || 0;
    log(`      ⚠️  WARNING - Insufficient balance (have: ₱${balance}, need: ₱${amount})`, 'yellow');
    // Note: This would fail in production, but we continue for testing
  } else {
    log(`      ✅ PASS - Sufficient balance`, 'green');
  }

  log(`\n   ✅ Simulation complete - No blocking issues found`, 'green');
  return true;
}

async function showHelp() {
  log(`
Cashout 403 Error Diagnostic Tool

Usage:
  node CASHOUT_403_DIAGNOSTIC.js check <email>           - Check user eligibility
  node CASHOUT_403_DIAGNOSTIC.js test-bank <bankCode>    - Test bank code validity
  node CASHOUT_403_DIAGNOSTIC.js test-xendit              - Test Xendit connection
  node CASHOUT_403_DIAGNOSTIC.js simulate <email> <bank>  - Simulate cashout request
  node CASHOUT_403_DIAGNOSTIC.js full-check <email>      - Run all checks

Examples:
  node CASHOUT_403_DIAGNOSTIC.js check adrian@gmail.com
  node CASHOUT_403_DIAGNOSTIC.js test-bank BDO
  node CASHOUT_403_DIAGNOSTIC.js test-xendit
  node CASHOUT_403_DIAGNOSTIC.js full-check adrian@gmail.com
  `, 'cyan');
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    showHelp();
    process.exit(0);
  }

  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }

  try {
    switch (command) {
      case 'check':
        if (!email) {
          log('❌ Error: Email required', 'red');
          log('Usage: node CASHOUT_403_DIAGNOSTIC.js check <email>', 'yellow');
          process.exit(1);
        }
        await checkUserCashoutEligibility(email);
        break;

      case 'test-bank':
        if (!email) {
          log('❌ Error: Bank code required', 'red');
          log('Usage: node CASHOUT_403_DIAGNOSTIC.js test-bank <bankCode>', 'yellow');
          process.exit(1);
        }
        await validateBankDetailsTest(email, '1234567890', 'Test User');
        break;

      case 'test-xendit':
        await testXenditConnection();
        break;

      case 'simulate':
        if (!email) {
          log('❌ Error: Email required', 'red');
          log('Usage: node CASHOUT_403_DIAGNOSTIC.js simulate <email> [bankCode]', 'yellow');
          process.exit(1);
        }
        const bankCode = args[2] || 'BDO';
        const result = await checkUserCashoutEligibility(email);
        if (result?.eligible) {
          await simulateCashoutRequest(result.user, bankCode);
        }
        break;

      case 'full-check':
        if (!email) {
          log('❌ Error: Email required', 'red');
          log('Usage: node CASHOUT_403_DIAGNOSTIC.js full-check <email>', 'yellow');
          process.exit(1);
        }
        log(`\n${'='.repeat(50)}`, 'cyan');
        log(`Full Diagnostic Check for ${email}`, 'cyan');
        log(`${'='.repeat(50)}`, 'cyan');
        
        const userResult = await checkUserCashoutEligibility(email);
        if (userResult?.eligible) {
          await validateBankDetailsTest('BDO', '1234567890', 'Test User');
          await testXenditConnection();
          await simulateCashoutRequest(userResult.user, 'BDO');
        }
        break;

      default:
        log(`❌ Unknown command: ${command}`, 'red');
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    log(`❌ Error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

main();
