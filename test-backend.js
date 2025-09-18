const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

async function testBackend() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Test user creation with address
    const testUser = new User({
      fullName: 'John Doe',
      email: 'john.doe@test.com',
      password: 'password123',
      phoneNumber: '+639123456789',
      role: 'commuter',
      address: {
        street: '123 Main Street',
        city: 'Naga City',
        province: 'Camarines Sur',
        postalCode: '4400',
        country: 'Philippines'
      }
    });

    await testUser.save();
    console.log('✅ User created successfully with address:', testUser.address.fullAddress);

    // Test driver creation with address
    const testDriver = new User({
      fullName: 'Jane Smith',
      email: 'jane.smith@test.com',
      password: 'password123',
      phoneNumber: '+639987654321',
      role: 'driver',
      licenseNumber: 'DL123456789',
      address: {
        street: '456 Driver Avenue',
        city: 'Naga City',
        province: 'Camarines Sur',
        postalCode: '4400',
        country: 'Philippines'
      }
    });

    await testDriver.save();
    console.log('✅ Driver created successfully with address:', testDriver.address.fullAddress);

    // Test finding users by city
    const usersInNaga = await User.find({ 'address.city': /naga/i }).select('fullName address');
    console.log('✅ Users in Naga City:', usersInNaga.length);

    // Test password comparison
    const isPasswordValid = await testUser.comparePassword('password123');
    console.log('✅ Password comparison works:', isPasswordValid);

    // Clean up test data
    await User.deleteMany({ email: { $in: ['john.doe@test.com', 'jane.smith@test.com'] } });
    console.log('✅ Test data cleaned up');

    console.log('\n🎉 All backend tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  testBackend();
}

module.exports = testBackend;