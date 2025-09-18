const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

// Script to create an admin user
async function createAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Admin user data
    const adminData = {
      firstName: 'Admin',
      lastName: 'User',
      middleName: 'System',
      email: 'admin@eyytrike.com',
      password: 'admin123',
      phoneNumber: '+639123456789',
      role: 'admin',
      address: {
        street: 'Admin Building',
        city: 'Naga City',
        province: 'Camarines Sur',
        postalCode: '4400',
        country: 'Philippines'
      }
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', adminData.email);
      console.log('Admin details:', {
        id: existingAdmin._id,
        firstName: existingAdmin.firstName,
        lastName: existingAdmin.lastName,
        middleName: existingAdmin.middleName,
        fullName: existingAdmin.fullName,
        email: existingAdmin.email,
        role: existingAdmin.role
      });
      return;
    }

    // Create admin user
    const admin = new User(adminData);
    await admin.save();

    console.log('🎉 Admin user created successfully!');
    console.log('Admin details:', {
      id: admin._id,
      firstName: admin.firstName,
      lastName: admin.lastName,
      middleName: admin.middleName,
      fullName: admin.fullName,
      email: admin.email,
      role: admin.role
    });
    console.log('\n📝 Login credentials:');
    console.log('Email:', adminData.email);
    console.log('Password:', adminData.password);
    console.log('\n🔐 Use these credentials to login and access admin CRUD operations.');

  } catch (error) {
    console.error('❌ Error creating admin user:', error.message);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      console.error('Validation errors:', messages.join(', '));
    }
  } finally {
    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
  }
}

// Run the script
createAdmin();
