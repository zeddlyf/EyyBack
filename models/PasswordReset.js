const mongoose = require('mongoose');

const passwordResetSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  otpExpiresAt: {
    type: Date,
    required: true,
    index: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  maxAttempts: {
    type: Number,
    default: 5,
  },
  resetTokenHash: {
    type: String,
  },
  resetTokenExpiresAt: {
    type: Date,
  },
  deliveredChannels: {
    type: [String],
    default: [],
  },
  locale: {
    type: String,
    default: 'en',
  },
  status: {
    type: String,
    enum: ['pending', 'verified', 'completed', 'expired'],
    default: 'pending',
  },
}, { timestamps: true });

passwordResetSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // cleanup after 24h

module.exports = mongoose.model('PasswordReset', passwordResetSchema);
