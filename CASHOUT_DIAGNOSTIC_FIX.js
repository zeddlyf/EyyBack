#!/usr/bin/env node
/**
 * Comprehensive Cashout 403 Error Diagnostic & Fix Script
 * 
 * This script helps diagnose and fix the 403 error on driver cashout
 * 
 * Root Cause: User registered with wrong role (e.g., 'commuter' instead of 'driver')
 * 
 * Usage:
 *   1. node CASHOUT_DIAGNOSTIC_FIX.js check <email>
 *   2. node CASHOUT_DIAGNOSTIC_FIX.js fix <email>
 *   3. node CASHOUT_DIAGNOSTIC_FIX.js test <email>
 */

const axios = require('axios');
const readline = require('readline');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise(resolve => rl.question(prompt, resolve));

async function checkUserRole(email) {
  try {
    console.log(`\n🔍 Checking user role for: ${email}`);
    const response = await axios.get(`${API_URL}/auth/dev/check-user/${email}`);
    
    const user = response.data;
    console.log('\n📋 User Information:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Approval Status: ${user.approvalStatus}`);
    console.log(`   License: ${user.licenseNumber || 'N/A'}`);
    console.log(`   Created: ${new Date(user.createdAt).toLocaleString()}`);
    
    if (user.role === 'driver') {
      console.log('\n✅ User IS a driver - should be able to cashout');
      return true;
    } else {
      console.log(`\n❌ User is a '${user.role}' but needs to be a 'driver' to cashout`);
      return false;
    }
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    console.error(`\n❌ Error checking user: ${errorMsg}`);
    return false;
  }
}

async function fixUserRole(email) {
  try {
    console.log(`\n🔧 Fixing user role for: ${email}`);
    
    const response = await axios.post(`${API_URL}/auth/dev/fix-user-role`, {
      email: email.toLowerCase(),
      role: 'driver'
    });
    
    console.log('\n✅ User role updated successfully!');
    console.log(`   Previous role: ${response.data.changed.from}`);
    console.log(`   New role: ${response.data.changed.to}`);
    
    if (response.data.user) {
      console.log(`   Name: ${response.data.user.firstName} ${response.data.user.lastName}`);
      console.log(`   Approval Status: ${response.data.user.approvalStatus}`);
    }
    
    return true;
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    console.error(`\n❌ Error fixing user role: ${errorMsg}`);
    return false;
  }
}

async function testCashoutFlow(email, password) {
  try {
    console.log(`\n🚀 Testing cashout flow for: ${email}`);
    
    // Step 1: Login
    console.log('\n📝 Step 1: Logging in...');
    let loginResponse;
    try {
      loginResponse = await axios.post(`${API_URL}/auth/login`, {
        email: email.toLowerCase(),
        password
      });
    } catch (loginError) {
      const errorMsg = loginError.response?.data?.error || loginError.message;
      console.error(`❌ Login failed: ${errorMsg}`);
      return false;
    }
    
    const token = loginResponse.data.token;
    const user = loginResponse.data.user;
    
    console.log(`✅ Login successful`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Email: ${user.email}`);
    
    if (user.role !== 'driver') {
      console.log(`\n❌ User is NOT a driver (role=${user.role}). Cannot test cashout.`);
      console.log('   Fix the role first using: node CASHOUT_DIAGNOSTIC_FIX.js fix <email>');
      return false;
    }
    
    // Step 2: Check wallet
    console.log('\n💰 Step 2: Checking wallet balance...');
    let walletResponse;
    try {
      walletResponse = await axios.get(`${API_URL}/wallet`, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (walletError) {
      const errorMsg = walletError.response?.data?.error || walletError.message;
      console.error(`❌ Wallet fetch failed: ${errorMsg}`);
      return false;
    }
    
    const balance = walletResponse.data.balance || walletResponse.data.amount || 0;
    console.log(`✅ Wallet retrieved`);
    console.log(`   Balance: ₱${balance.toFixed(2)}`);
    console.log(`   Currency: ${walletResponse.data.currency || 'PHP'}`);
    
    if (balance < 100) {
      console.log(`\n⚠️  Balance (₱${balance.toFixed(2)}) is less than minimum cashout (₱100)`);
      console.log('   Skipping cashout test due to insufficient balance');
      return true;
    }
    
    // Step 3: Test cashout
    console.log('\n💸 Step 3: Testing cashout (₱100)...');
    let cashoutResponse;
    try {
      cashoutResponse = await axios.post(
        `${API_URL}/wallet/cashout`,
        {
          amount: 100,
          bankCode: 'GCASH',
          accountNumber: '09123456789',
          accountHolderName: user.firstName + ' ' + user.lastName
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      console.log(`✅ Cashout request successful!`);
      console.log(`   Payout ID: ${cashoutResponse.data.payoutId}`);
      console.log(`   Reference ID: ${cashoutResponse.data.referenceId}`);
      console.log(`   Amount: ₱${cashoutResponse.data.amount.toFixed(2)}`);
      console.log(`   Status: ${cashoutResponse.data.status}`);
      console.log(`   Message: ${cashoutResponse.data.message}`);
      
      return true;
    } catch (cashoutError) {
      const errorData = cashoutError.response?.data || {};
      const errorMsg = errorData.error || cashoutError.message;
      
      console.error(`❌ Cashout failed: ${errorMsg}`);
      
      if (errorData.userRole) {
        console.error(`   User Role: ${errorData.userRole}`);
      }
      if (errorData.message) {
        console.error(`   Details: ${errorData.message}`);
      }
      
      return false;
    }
  } catch (error) {
    console.error(`\n❌ Test flow error: ${error.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();
  const email = args[1]?.toLowerCase();
  
  if (!command || !email) {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║       Cashout 403 Error - Diagnostic & Fix Script              ║
╚════════════════════════════════════════════════════════════════╝

USAGE:
  node CASHOUT_DIAGNOSTIC_FIX.js <command> <email> [password]

COMMANDS:
  check <email>
    - Check the user's current role and approval status
    - Shows if they can cashout or if role needs to be fixed
    
  fix <email>
    - Update user's role to 'driver' (requires NODE_ENV !== 'production')
    - Use this if user is registered as 'commuter' but needs to be 'driver'
    
  test <email> <password>
    - Full cashout flow test: login, check wallet, test cashout
    - Helps verify that the user can cashout successfully

EXAMPLES:
  node CASHOUT_DIAGNOSTIC_FIX.js check user@example.com
  node CASHOUT_DIAGNOSTIC_FIX.js fix user@example.com
  node CASHOUT_DIAGNOSTIC_FIX.js test user@example.com mypassword

ROOT CAUSE OF 403 ERROR:
  User registered with wrong role (e.g., 'commuter' instead of 'driver')
  
  The cashout endpoint requires:
    ✓ role === 'driver'
    ✓ amount >= 100
    ✓ available balance >= requested amount
    ✓ valid bank details
    
TROUBLESHOOTING:
  1. Check role:  node CASHOUT_DIAGNOSTIC_FIX.js check <email>
  2. If wrong role, fix it:  node CASHOUT_DIAGNOSTIC_FIX.js fix <email>
  3. Test flow:  node CASHOUT_DIAGNOSTIC_FIX.js test <email> <password>

ENVIRONMENT:
  API_URL: ${API_URL}
  NODE_ENV: ${process.env.NODE_ENV || 'development'}
  
Dev endpoints available: ${process.env.NODE_ENV !== 'production' ? '✅ YES' : '❌ NO'}
    `);
    
    rl.close();
    process.exit(1);
  }
  
  try {
    switch (command) {
      case 'check':
        await checkUserRole(email);
        break;
        
      case 'fix':
        const isDriver = await checkUserRole(email);
        if (!isDriver) {
          const confirm = await question('\nFix user role to driver? (y/n): ');
          if (confirm.toLowerCase() === 'y') {
            await fixUserRole(email);
          }
        } else {
          console.log('\n✅ User is already a driver. No fix needed.');
        }
        break;
        
      case 'test':
        const password = args[2];
        if (!password) {
          console.error('❌ Password is required for test command');
          console.error('Usage: node CASHOUT_DIAGNOSTIC_FIX.js test <email> <password>');
          rl.close();
          process.exit(1);
        }
        await testCashoutFlow(email, password);
        break;
        
      default:
        console.error(`❌ Unknown command: ${command}`);
        console.error('Valid commands: check, fix, test');
        rl.close();
        process.exit(1);
    }
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    rl.close();
    process.exit(1);
  }
  
  rl.close();
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  rl.close();
  process.exit(1);
});
