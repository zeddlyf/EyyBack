#!/usr/bin/env node
/**
 * Test Xendit Payout Creation
 * 
 * This script tests creating a real payout with Xendit
 */

const axios = require('axios');
require('dotenv').config();

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

async function testPayout() {
  const apiKey = process.env.XENDIT_API_KEY;
  
  log(`\n${'='.repeat(60)}`, 'cyan');
  log('Xendit Payout Creation Test', 'cyan');
  log(`${'='.repeat(60)}`, 'cyan');

  // Test data
  const testPayload = {
    reference_id: `test_payout_${Date.now()}`,
    amount: 100,
    currency: 'PHP',
    channel_code: 'BDO',  // BDO bank code
    channel_properties: {
      account_holder_name: 'Test User',
      account_number: '1234567890'  // Test account
    },
    description: 'Test payout'
  };

  log(`\nTest Payout Details:`, 'blue');
  log(`  Amount: ₱${testPayload.amount}`, 'blue');
  log(`  Bank: ${testPayload.channel_code}`, 'blue');
  log(`  Account: ${testPayload.channel_properties.account_number}`, 'blue');
  log(`  Holder: ${testPayload.channel_properties.account_holder_name}`, 'blue');

  try {
    log(`\nSending payout request to Xendit...`, 'yellow');
    
    const basic = Buffer.from(`${apiKey}:`).toString('base64');
    const response = await axios.post(
      'https://api.xendit.co/payouts',
      testPayload,
      {
        headers: {
          'Authorization': `Basic ${basic}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    log(`\n✅ PAYOUT CREATED SUCCESSFULLY!`, 'green');
    log(`\nResponse:`, 'blue');
    log(JSON.stringify(response.data, null, 2), 'blue');

    log(`\nKey Details:`, 'green');
    log(`  Payout ID: ${response.data.id}`, 'green');
    log(`  Reference ID: ${response.data.reference_id}`, 'green');
    log(`  Status: ${response.data.status}`, 'green');
    log(`  Amount: ${response.data.amount}`, 'green');

  } catch (error) {
    log(`\n❌ PAYOUT CREATION FAILED`, 'red');

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      log(`\nError Details:`, 'red');
      log(`  Status Code: ${status}`, 'red');
      log(`  Error Message: ${data.error_code || data.message || 'Unknown error'}`, 'red');
      log(`  Full Response: ${JSON.stringify(data, null, 2)}`, 'red');

      // Provide diagnosis
      if (status === 401 || status === 403) {
        log(`\n🔧 Diagnosis: API Authentication Failed`, 'yellow');
        log(`  Your API key may not have payout permissions`, 'yellow');
        log(`  Fix: Check Xendit dashboard settings`, 'yellow');
      } else if (status === 400) {
        log(`\n🔧 Diagnosis: Invalid Request Data`, 'yellow');
        if (data.errors) {
          log(`  Validation errors:`, 'yellow');
          Object.entries(data.errors).forEach(([key, value]) => {
            log(`    • ${key}: ${value}`, 'yellow');
          });
        }
        
        // Common issues
        if (data.error_code === 'CHANNEL_NOT_SUPPORTED') {
          log(`  The bank code 'BDO' may not be supported for payouts`, 'yellow');
          log(`  Supported channels: Check Xendit dashboard`, 'yellow');
        } else if (data.error_code === 'INVALID_CHANNEL_PROPERTY') {
          log(`  Account number format might be invalid`, 'yellow');
          log(`  Make sure account number matches bank requirements`, 'yellow');
        }
      } else if (status === 402) {
        log(`\n🔧 Diagnosis: Payment Required`, 'yellow');
        log(`  Your Xendit account may have insufficient balance`, 'yellow');
        log(`  Or there's a billing issue`, 'yellow');
      } else if (status >= 500) {
        log(`\n🔧 Diagnosis: Xendit Server Error`, 'yellow');
        log(`  Xendit API is experiencing issues`, 'yellow');
        log(`  Try again in a few moments`, 'yellow');
      }
    } else if (error.code === 'ECONNREFUSED') {
      log(`\n🔧 Diagnosis: Connection Refused`, 'yellow');
      log(`  Cannot reach Xendit API`, 'yellow');
      log(`  Check your internet connection`, 'yellow');
    } else {
      log(`\nError: ${error.message}`, 'red');
    }
  }

  log(`\n${'='.repeat(60)}\n`, 'cyan');
}

testPayout();
