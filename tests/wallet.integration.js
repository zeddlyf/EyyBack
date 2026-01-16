const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const User = require('../models/User');

// Test wallet operations
async function testWalletOperations() {
  try {
    console.log('\n=== Wallet Integration Test ===\n');

    // Create test users
    const passengerUser = new User({
      firstName: 'Test',
      lastName: 'Passenger',
      email: `passenger_${Date.now()}@test.com`,
      phoneNumber: '09171234567',
      role: 'passenger'
    });
    await passengerUser.save();
    console.log('✓ Created passenger user:', passengerUser._id);

    const driverUser = new User({
      firstName: 'Test',
      lastName: 'Driver',
      email: `driver_${Date.now()}@test.com`,
      phoneNumber: '09171234568',
      role: 'driver'
    });
    await driverUser.save();
    console.log('✓ Created driver user:', driverUser._id);

    // Create wallets
    const passengerWallet = new Wallet({
      user: passengerUser._id,
      balance: 1000,
      currency: 'PHP'
    });
    await passengerWallet.saveWithRepair();
    console.log('✓ Created passenger wallet with balance: ₱1000');

    const driverWallet = new Wallet({
      user: driverUser._id,
      balance: 0,
      currency: 'PHP'
    });
    await driverWallet.saveWithRepair();
    console.log('✓ Created driver wallet with balance: ₱0');

    // Test deduction
    console.log('\n--- Testing Deduction ---');
    const fare = 250;
    const deductRefId = `test_deduct_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await passengerWallet.deductFunds(fare, {
      type: 'PAYMENT',
      referenceId: deductRefId,
      description: 'Test ride payment',
      metadata: { testType: 'deduction' }
    });
    console.log(`✓ Deducted ₱${fare} from passenger wallet`);

    // Refresh passenger wallet
    const refreshedPassenger = await Wallet.findById(passengerWallet._id);
    console.log(`✓ Passenger balance after deduction: ₱${refreshedPassenger.balance}`);
    console.log(`✓ Transaction count: ${refreshedPassenger.transactions.length}`);

    // Test addition
    console.log('\n--- Testing Addition ---');
    const addRefId = `test_add_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await driverWallet.addFunds(fare, {
      type: 'TOPUP',
      referenceId: addRefId,
      paymentMethod: 'RIDE_PAYMENT',
      description: 'Test ride income',
      metadata: { testType: 'addition' }
    });
    console.log(`✓ Added ₱${fare} to driver wallet`);

    // Refresh driver wallet
    const refreshedDriver = await Wallet.findById(driverWallet._id);
    console.log(`✓ Driver balance after addition: ₱${refreshedDriver.balance}`);
    console.log(`✓ Transaction count: ${refreshedDriver.transactions.length}`);

    // Test multiple rapid transactions (stress test)
    console.log('\n--- Testing Multiple Rapid Transactions ---');
    const amounts = [100, 50, 75];
    for (let i = 0; i < amounts.length; i++) {
      const refId = `stress_test_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
      await driverWallet.addFunds(amounts[i], {
        type: 'TOPUP',
        referenceId: refId,
        paymentMethod: 'RIDE_PAYMENT',
        description: `Stress test transaction ${i + 1}`,
        metadata: { stressTest: true, index: i }
      });
      console.log(`✓ Added ₱${amounts[i]} (transaction ${i + 1}/3)`);
    }

    // Final check
    const finalDriver = await Wallet.findById(driverWallet._id);
    console.log(`\n✓ Final driver balance: ₱${finalDriver.balance}`);
    console.log(`✓ Total transactions: ${finalDriver.transactions.length}`);

    // Display transactions
    console.log('\n--- Transaction History ---');
    finalDriver.transactions.slice(-5).forEach((txn, idx) => {
      console.log(`${idx + 1}. ${txn.type} | ₱${txn.amount} | ${txn.status} | ${txn.referenceId}`);
    });

    console.log('\n✅ All tests passed!');

    // Cleanup
    await User.deleteMany({ _id: { $in: [passengerUser._id, driverUser._id] } });
    await Wallet.deleteMany({ _id: { $in: [passengerWallet._id, driverWallet._id] } });
    console.log('✓ Cleaned up test data');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/eyyback';
  mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => testWalletOperations())
    .then(() => mongoose.connection.close())
    .catch(err => {
      console.error('Connection error:', err);
      process.exit(1);
    });
}

module.exports = { testWalletOperations };
