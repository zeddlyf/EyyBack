const mongoose = require('mongoose');

const emergencyContactSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['driver','commuter'], required: true },
  name: { type: String, required: true },
  phoneEncrypted: { type: String, required: true },
  priority: { type: Number, min: 1, max: 5, default: 1 },
  enabled: { type: Boolean, default: true },
}, { timestamps: true });

emergencyContactSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('EmergencyContact', emergencyContactSchema);