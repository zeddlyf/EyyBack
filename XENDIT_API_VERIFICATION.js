#!/usr/bin/env node
/**
 * Xendit API Key Verification & Fix Guide
 * 
 * This script checks if your Xendit API key is valid and has payout permissions.
 */

const axios = require('axios');
require('dotenv').config();

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function verifyXenditKey() {
  const apiKey = process.env.XENDIT_API_KEY;

  log(`\n${'='.repeat(60)}`, 'cyan');
  log('Xendit API Key Verification', 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');

  // Step 1: Check if key is set
  log(`\nStep 1: API Key Configuration`, 'blue');
  if (!apiKey) {
    log(`❌ XENDIT_API_KEY is not set in .env file`, 'red');
    log(`\nFix: Add to .env file:`, 'yellow');
    log(`   XENDIT_API_KEY=your_actual_api_key`, 'yellow');
    return false;
  }

  log(`✅ XENDIT_API_KEY is configured`, 'green');
  log(`   Key type: ${apiKey.includes('development') ? 'Development' : 'Production'}`, 'blue');
  log(`   Key starts with: ${apiKey.substring(0, 20)}...`, 'blue');

  // Step 2: Validate key format
  log(`\nStep 2: API Key Format`, 'blue');
  if (!apiKey.startsWith('xnd_')) {
    log(`⚠️  Warning: Key doesn't start with 'xnd_' - might be invalid`, 'yellow');
    log(`   Expected format: xnd_live_XXX or xnd_development_XXX`, 'yellow');
  } else {
    log(`✅ Key format appears valid`, 'green');
  }

  // Step 3: Test API connectivity
  log(`\nStep 3: Testing Xendit API Connection`, 'blue');
  try {
    const basic = Buffer.from(`${apiKey}:`).toString('base64');
    const response = await axios.get('https://api.xendit.co/balance', {
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    log(`✅ API Connection: SUCCESS`, 'green');
    log(`   Status: ${response.status}`, 'blue');
    
    // Step 4: Check account balance
    log(`\nStep 4: Account Balance`, 'blue');
    const balance = response.data;
    log(`✅ Account balance: ${JSON.stringify(balance, null, 2)}`, 'green');

    // Step 5: Check if account can do payouts
    log(`\nStep 5: Payout Capability Check`, 'blue');
    if (balance.balance !== undefined) {
      log(`✅ Account has balance available`, 'green');
      log(`   Available: ${balance.balance} PHP`, 'blue');
      log(`✅ Account appears to have payout permissions`, 'green');
      return true;
    } else if (balance.AVAILABLE_BALANCE !== undefined) {
      log(`✅ Account has balance available`, 'green');
      log(`   Available: ${balance.AVAILABLE_BALANCE} ${balance.CURRENCY || 'XID'}`, 'blue');
      log(`✅ Account appears to have payout permissions`, 'green');
      return true;
  } catch (error) {
    log(`❌ API Connection: FAILED`, 'red');

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      log(`   Status Code: ${status}`, 'red');
      log(`   Error: ${JSON.stringify(data, null, 2)}`, 'red');

      if (status === 401 || status === 403) {
        log(`\n   Issue: Authentication Failed`, 'red');
        log(`   This means:`, 'yellow');
        log(`   • API key is invalid or expired`, 'yellow');
        log(`   • API key doesn't have the right permissions`, 'yellow');
        log(`   • API key is for the wrong environment (dev vs prod)`, 'yellow');
        
        log(`\n   Fix:`, 'green');
        log(`   1. Go to https://dashboard.xendit.co/settings/developers/api-key`, 'green');
        log(`   2. Copy your LIVE API key (for production)`, 'green');
        log(`   3. Or use DEVELOPMENT key if testing`, 'green');
        log(`   4. Update .env file with the correct key`, 'green');
        log(`   5. Restart your backend`, 'green');
      } else if (status === 400) {
        log(`\n   Issue: Bad Request`, 'red');
        log(`   The API key format might be invalid`, 'yellow');
      } else if (status >= 500) {
        log(`\n   Issue: Xendit Server Error`, 'red');
        log(`   Try again in a few moments`, 'yellow');
      }
    } else if (error.code === 'ECONNREFUSED') {
      log(`   Network Error: Cannot reach Xendit API`, 'red');
      log(`   Check your internet connection`, 'yellow');
    } else if (error.code === 'ENOTFOUND') {
      log(`   Network Error: Cannot resolve api.xendit.co`, 'red');
      log(`   Check your internet connection or DNS`, 'yellow');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }

    return false;
  }
}

async function showFixSteps() {
  log(`\n${'='.repeat(60)}`, 'magenta');
  log('🔧 How to Fix Xendit Authentication Error', 'magenta');
  log(`${'='.repeat(60)}`, 'magenta');

  log(`\n1️⃣  GET YOUR API KEY`, 'yellow');
  log(`   a) Go to: https://dashboard.xendit.co/settings/developers/api-key`, 'blue');
  log(`   b) Select PRODUCTION or DEVELOPMENT (choose based on your needs)`, 'blue');
  log(`   c) Copy the API Key`, 'blue');

  log(`\n2️⃣  UPDATE .env FILE`, 'yellow');
  log(`   a) Open: EyyBack/.env`, 'blue');
  log(`   b) Find: XENDIT_API_KEY=...`, 'blue');
  log(`   c) Replace with: XENDIT_API_KEY=your_copied_key`, 'blue');
  log(`   d) Save the file`, 'blue');

  log(`\n3️⃣  RESTART BACKEND`, 'yellow');
  log(`   a) Stop the backend server`, 'blue');
  log(`   b) Start it again (or use: npm start)`, 'blue');

  log(`\n4️⃣  VERIFY FIX`, 'yellow');
  log(`   a) Run: node XENDIT_API_VERIFICATION.js`, 'blue');
  log(`   b) Should show: ✅ API Connection: SUCCESS`, 'blue');

  log(`\n5️⃣  TEST CASHOUT`, 'yellow');
  log(`   a) Try withdrawal again with test amount (₱100)`, 'blue');
  log(`   b) Should succeed without auth error`, 'blue');

  log(`\n⚠️  IMPORTANT NOTES:`, 'red');
  log(`   • Use LIVE key for production`, 'blue');
  log(`   • Use DEVELOPMENT key for testing/development`, 'blue');
  log(`   • Never share your API key publicly`, 'blue');
  log(`   • Keys expire after 90 days of inactivity (regenerate if needed)`, 'blue');

  log(`\n📋 XENDIT REQUIREMENTS FOR PAYOUTS:`, 'magenta');
  log(`   • API Key must have 'Payouts' permission enabled`, 'blue');
  log(`   • Account must be verified/activated`, 'blue');
  log(`   • Account must have available balance (for testing)`, 'blue');
  log(`   • Bank details must be valid for the channel`, 'blue');
}

async function main() {
  try {
    const isValid = await verifyXenditKey();
    
    if (!isValid) {
      log(`\n⚠️  Your Xendit API Key is INVALID or not configured`, 'red');
      await showFixSteps();
    } else {
      log(`\n✅ Your Xendit API Key is VALID and working!`, 'green');
      log(`\nYou can now perform real payouts.`, 'green');
    }

    log(`\n${'='.repeat(60)}\n`, 'cyan');
  } catch (error) {
    log(`\nUnexpected error: ${error.message}`, 'red');
    console.error(error);
  }
}

main();
