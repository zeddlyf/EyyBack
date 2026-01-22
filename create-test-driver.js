const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Wallet = require('./models/Wallet');

async function createTestDriver() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log('Connected to MongoDB');

    // Check if test driver already exists
    let driver = await User.findOne({ email: 'testdriver@example.com' });

    if (driver) {
      console.log('✅ Test driver already exists:', driver.email);
      // Ensure role is driver
      if (driver.role !== 'driver') {
        driver.role = 'driver';
        driver.approvalStatus = 'approved'; // Approve for testing
        await driver.save();
        console.log('✅ Updated driver role to: driver');
      }
    } else {
      // Create new test driver
      driver = new User({
        firstName: 'Test',
        lastName: 'Driver',
        email: 'testdriver@example.com',
        phoneNumber: '+63912345678',
        password: 'TestPassword123!',
        role: 'driver',
        approvalStatus: 'approved',
        licenseNumber: 'DL123456789',
        address: {
          street: '123 Main Street',
          city: 'Manila',
          province: 'NCR',
          zipCode: '1000'
        }
      });

      await driver.save();
      console.log('✅ Test driver created:', driver.email);
    }

    // Ensure wallet exists
    let wallet = await Wallet.findByUserId(driver._id);
    if (!wallet) {
      const crypto = require('crypto');
      const referenceId = `wallet_${driver._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      wallet = new Wallet({
        user: driver._id,
        referenceId,
        balance: 1000, // Give test balance
        currency: 'PHP',
        transactions: []
      });
      await wallet.saveWithRepair();
      console.log('✅ Wallet created with ₱1000 balance');
    } else {
      console.log('✅ Wallet already exists, balance:', wallet.balance);
    }

    console.log('\n✅ Test driver setup complete!');
    console.log('Email: testdriver@example.com');
    console.log('Password: TestPassword123!');
    console.log('Wallet balance: ₱' + wallet.balance.toFixed(2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestDriver();
