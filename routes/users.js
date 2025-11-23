const express = require('express');
const router = express.Router();
const User = require('../models/User');
const auth = require('../middleware/auth');
const { requireRole } = require('../middleware/auth');

// Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user profile
router.patch('/profile', auth, async (req, res) => {
  const updates = Object.keys(req.body);
  const allowedUpdates = ['firstName', 'lastName', 'middleName', 'email', 'phoneNumber', 'address', 'profilePicture'];
  const isValidOperation = updates.every(update => allowedUpdates.includes(update));

  if (!isValidOperation) {
    return res.status(400).json({ error: 'Invalid updates!' });
  }

  try {
    // Handle address updates specially
    if (req.body.address) {
      if (!req.body.address.city || !req.body.address.province) {
        return res.status(400).json({ error: 'City and province are required in address' });
      }
      req.user.address = {
        street: req.body.address.street || req.user.address?.street || '',
        city: req.body.address.city,
        province: req.body.address.province,
        postalCode: req.body.address.postalCode || req.user.address?.postalCode || '',
        country: req.body.address.country || req.user.address?.country || 'Philippines'
      };
    }

    // Handle other updates
    updates.forEach(update => {
      if (update !== 'address') {
        req.user[update] = req.body[update];
      }
    });

    await req.user.save();
    res.json(req.user.toJSON());
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: error.message });
  }
});

// Update driver availability
router.patch('/driver/availability', auth, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can update availability' });
    }
    // Allow turning OFF availability regardless of approval
    // Only turning ON requires approval
    const desired = !!req.body.isAvailable;
    if (desired === true && req.user.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Driver not approved by admin' });
    }

    req.user.isAvailable = desired;
    await req.user.save();
    res.json(req.user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update driver location
router.patch('/driver/location', auth, async (req, res) => {
  try {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Only drivers can update location' });
    }
    if (req.user.approvalStatus !== 'approved') {
      return res.status(403).json({ error: 'Driver not approved by admin' });
    }

    req.user.location = {
      type: 'Point',
      coordinates: [req.body.longitude, req.body.latitude]
    };
    await req.user.save();
    res.json(req.user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: list drivers pending approval
router.get('/admin/drivers/pending', auth, requireRole('admin'), async (req, res) => {
  try {
    const drivers = await User.find({ role: 'driver', approvalStatus: 'pending' }).select('-password');
    res.json(drivers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: approve driver
router.post('/admin/drivers/:id/approve', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'driver') {
      return res.status(404).json({ error: 'Driver not found' });
    }
    user.approvalStatus = 'approved';
    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Admin: reject driver
router.post('/admin/drivers/:id/reject', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'driver') {
      return res.status(404).json({ error: 'Driver not found' });
    }
    user.approvalStatus = 'rejected';
    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get nearby drivers
router.get('/drivers/nearby', auth, async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;
    
    const drivers = await User.find({
      role: 'driver',
      isAvailable: true,
      location: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(maxDistance)
        }
      }
    }).select('-password');

    res.json(drivers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all active drivers (optionally filter by city)
router.get('/drivers/active', auth, async (req, res) => {
  try {
    const { city } = req.query;
    const query = { role: 'driver', isAvailable: true };
    if (city) {
      query['address.city'] = new RegExp(city, 'i');
    }
    const drivers = await User.find(query).select('-password');
    res.json(drivers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get driver location history
router.get('/driver/:id/location-history', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 100 } = req.query;
    const DriverLocation = require('../models/DriverLocation');
    const history = await DriverLocation.find({ driver: id })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    res.json(history);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get user address
router.get('/address', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('address');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user.address);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update user address
  router.patch('/address', auth, async (req, res) => {
    try {
      const { street, city, province, postalCode, country } = req.body;
      
      if (!city || !province) {
        return res.status(400).json({ error: 'City and province are required' });
      }

      req.user.address = {
        street: street || req.user.address?.street || '',
        barangay: req.body.barangay || req.user.address?.barangay || '',
        city,
        province,
        postalCode: postalCode || req.user.address?.postalCode || '',
        country: country || req.user.address?.country || 'Philippines'
      };

    await req.user.save();
    res.json(req.user.address);
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    res.status(400).json({ error: error.message });
  }
});

// Get users by city
router.get('/by-city/:city', auth, async (req, res) => {
  try {
    const { city } = req.params;
    const { role } = req.query;
    
    const query = { 
      'address.city': new RegExp(city, 'i'),
      isActive: true
    };
    
    if (role) {
      query.role = role;
    }
    
    const users = await User.find(query).select('-password');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ========== CRUD OPERATIONS ==========

// CREATE - Create a new user (Admin only)
router.post('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      middleName = '',
      email,
      password,
      phoneNumber,
      role,
      licenseNumber,
      address
    } = req.body;

    // Validate required fields
    if (!firstName || !lastName || !email || !password || !phoneNumber || !role) {
      return res.status(400).json({ 
        error: 'firstName, lastName, email, password, phoneNumber, and role are required' 
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Create new user
    const user = new User({
      firstName,
      lastName,
      middleName,
      email,
      password,
      phoneNumber,
      role,
      licenseNumber: role === 'driver' ? licenseNumber : undefined,
      address,
      approvalStatus: role === 'driver' ? 'pending' : 'approved'
    });

    await user.save();
    res.status(201).json(user.toJSON());
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

// READ - Get all users (Admin only)
router.get('/', auth, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, role, approvalStatus, search } = req.query;
    const query = {};

    // Add filters
    if (role) query.role = role;
    if (approvalStatus) query.approvalStatus = approvalStatus;
    if (search) {
      query.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phoneNumber: new RegExp(search, 'i') }
      ];
    }

    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await User.countDocuments(query);

    res.json({
      users,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// READ - Get user by ID (Admin only)
router.get('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(400).json({ error: error.message });
  }
});

// UPDATE - Update user by ID (Admin only)
router.put('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      middleName,
      email,
      phoneNumber,
      role,
      approvalStatus,
      licenseNumber,
      address,
      isActive
    } = req.body;

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (middleName !== undefined) user.middleName = middleName;
    if (email !== undefined) user.email = email;
    if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
    if (role !== undefined) user.role = role;
    if (approvalStatus !== undefined) user.approvalStatus = approvalStatus;
    if (licenseNumber !== undefined) user.licenseNumber = licenseNumber;
    if (address !== undefined) user.address = address;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(400).json({ error: error.message });
  }
});

// UPDATE - Partial update user by ID (Admin only)
router.patch('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const updates = Object.keys(req.body);
    const allowedUpdates = [
      'firstName', 'lastName', 'middleName', 'email', 'phoneNumber', 
      'role', 'approvalStatus', 'licenseNumber', 'address', 'isActive'
    ];
    const isValidOperation = updates.every(update => allowedUpdates.includes(update));

    if (!isValidOperation) {
      return res.status(400).json({ error: 'Invalid updates!' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    updates.forEach(update => {
      user[update] = req.body[update];
    });

    await user.save();
    res.json(user.toJSON());
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Delete user by ID (Admin only)
router.delete('/:id', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Soft delete - set isActive to false instead of actually deleting
    user.isActive = false;
    await user.save();

    res.json({ message: 'User deactivated successfully', user: user.toJSON() });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(400).json({ error: error.message });
  }
});

// DELETE - Hard delete user by ID (Admin only) - Use with caution
router.delete('/:id/hard', auth, requireRole('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User permanently deleted', user: user.toJSON() });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;