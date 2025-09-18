const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const auth = require('../middleware/auth');

// Register new user
router.post('/register', async (req, res) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Validate required fields
    const { firstName, lastName, middleName, email, password, phoneNumber, role, licenseNumber, address } = req.body;
    
    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ error: 'firstName, lastName, email, password, phoneNumber, and role are required' });
    }

    // Validate role-specific requirements
    if (role === 'driver' && !licenseNumber) {
      return res.status(400).json({ error: 'License number is required for drivers' });
    }

    // Validate address requirements
    if (!address || !address.city || !address.province) {
      return res.status(400).json({ error: 'City and province are required in address' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      middleName: middleName || '',
      email,
      password,
      phoneNumber,
      role,
      licenseNumber: role === 'driver' ? licenseNumber : undefined,
      address: {
        street: address.street || '',
        city: address.city,
        province: address.province,
        postalCode: address.postalCode || '',
        country: address.country || 'Philippines'
      }
    });

    await user.save();

    // If the user is a driver, ensure approvalStatus is pending by default
    if (role === 'driver' && user.approvalStatus !== 'pending') {
      user.approvalStatus = 'pending';
      await user.save();
    }

    // If the user is a commuter, create a wallet with a balance of 500
    if (role === 'commuter') {
      const wallet = new Wallet({
        user: user._id,
        type: 'commuter',
        amount: 500,
        currency: 'PHP'
      });
      await wallet.save();
    }

    // Generate token
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user: user.toJSON(),
      token
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: error.message });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid login credentials' });
    }

    // Generate token
    const token = jwt.sign(
      { _id: user._id.toString() },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: user.toJSON(),
      token
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.toJSON());
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router; 