#!/usr/bin/env node
/**
 * Fix User Role Script
 * 
 * This script helps diagnose and fix user role issues that cause 403 errors on cashout.
 * It can:
 * 1. Check the role of a specific user by email
 * 2. Update a user's role from commuter to driver
 * 3. Verify wallet connectivity
 */

const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
require('dotenv').config();

async function connectDB() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI not set in environment variables');
    }
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    return false;
  }
}

async function checkUserRole(email) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      return null;
    }

    console.log(`\n📋 User Information:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   ID: ${user._id}`);
    console.log(`   Created: ${user.createdAt}`);

    // Check wallet
    const wallet = await Wallet.findByUserId(user._id);
    if (wallet) {
      console.log(`\n💰 Wallet Information:`);
      console.log(`   Balance: ₱${wallet.balance.toFixed(2)}`);
      console.log(`   Transactions: ${wallet.transactions.length}`);
    } else {
      console.log(`\n💰 No wallet found for this user`);
    }

    return user;
  } catch (error) {
    console.error('❌ Error checking user:', error.message);
    return null;
  }
}

async function updateUserRole(email, newRole) {
  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      return false;
    }

    const oldRole = user.role;
    user.role = newRole;
    await user.save();

    console.log(`✅ User role updated:`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Old Role: ${oldRole}`);
    console.log(`   New Role: ${newRole}`);

    return true;
  } catch (error) {
    console.error('❌ Error updating user role:', error.message);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node fix-user-role.js <command> <email> [newRole]

Commands:
  check <email>           - Check user role
  update <email> <role>   - Update user role (e.g., 'driver' or 'commuter')

Examples:
  node fix-user-role.js check geeper@example.com
  node fix-user-role.js update geeper@example.com driver
    `);
    process.exit(0);
  }

  const connected = await connectDB();
  if (!connected) {
    process.exit(1);
  }

  try {
    const command = args[0];
    const email = args[1];

    if (!email) {
      console.log('❌ Email is required');
      process.exit(1);
    }

    if (command === 'check') {
      await checkUserRole(email);
    } else if (command === 'update') {
      const newRole = args[2];
      if (!newRole) {
        console.log('❌ New role is required for update command');
        process.exit(1);
      }
      if (!['driver', 'commuter', 'admin'].includes(newRole)) {
        console.log('❌ Invalid role. Must be "driver", "commuter", or "admin"');
        process.exit(1);
      }
      await updateUserRole(email, newRole);
    } else {
      console.log(`❌ Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

main().catch(console.error);
