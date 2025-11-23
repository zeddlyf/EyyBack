const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters long']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters long']
  },
  middleName: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters long']
  },
  phoneNumber: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^[0-9+\-\s()]{10,}$/, 'Please enter a valid phone number']
  },
  role: {
    type: String,
    enum: ['driver', 'commuter', 'admin'],
    required: [true, 'Role is required']
  },
  admin_id: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  commuter_id: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  driver_id: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: function() {
      return this.role === 'driver' ? 'pending' : 'approved';
    }
  },
  licenseNumber: {
    type: String,
    required: function() {
      return this.role === 'driver';
    },
    trim: true
  },
  address: {
    street: {
      type: String,
      trim: true
    },
    barangay: {
      type: String,
      trim: true,
      default: ''
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    province: {
      type: String,
      required: [true, 'Province is required'],
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    },
    country: {
      type: String,
      default: 'Philippines',
      trim: true
    },
    fullAddress: {
      type: String,
      trim: true
    }
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      default: [0, 0]
    }
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  totalRides: {
    type: Number,
    default: 0,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  profilePicture: {
    type: String,
    default: null
  }
  ,
  notificationPreferences: {
    type: Object,
    default: {
      system: true,
      message: true,
      admin: true,
      ride: true,
      payment: true,
      email: { system: false, message: false, admin: false, ride: false, payment: false },
      sms: { system: false, message: false, admin: false, ride: false, payment: false }
    }
  },
  pushToken: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

// Create index for location queries
userSchema.index({ location: '2dsphere' });
userSchema.index({ email: 1 }, { unique: true });

// Virtual field for full name
userSchema.virtual('fullName').get(function() {
  const parts = [this.firstName];
  if (this.middleName) {
    parts.push(this.middleName);
  }
  parts.push(this.lastName);
  return parts.join(' ');
});

// Ensure virtual fields are serialized
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

// Generate full address before saving
  userSchema.pre('save', function(next) {
    if (this.address && (this.isModified('address') || this.isNew)) {
      const addressParts = [];
      if (this.address.street) addressParts.push(this.address.street);
      if (this.address.barangay) addressParts.push(this.address.barangay);
      if (this.address.city) addressParts.push(this.address.city);
      if (this.address.province) addressParts.push(this.address.province);
      if (this.address.postalCode) addressParts.push(this.address.postalCode);
      if (this.address.country) addressParts.push(this.address.country);
      
      this.address.fullAddress = addressParts.join(', ');
    }
    next();
  });

// Hash password before saving
userSchema.pre('save', async function(next) {
  const user = this;
  if (user.isModified('password')) {
    try {
      user.password = await bcrypt.hash(user.password, 10);
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(password) {
  try {
    return await bcrypt.compare(password, this.password);
  } catch (error) {
    throw new Error('Error comparing passwords');
  }
};

// Remove sensitive data when converting to JSON
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model('User', userSchema);

module.exports = User;