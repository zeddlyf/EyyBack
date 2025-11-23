const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
  name: String,
  phoneMasked: String,
  status: { type: String, enum: ['queued','sent','delivered','failed'], default: 'queued' },
  providerMessageId: String,
});

const emergencyAlertSchema = new mongoose.Schema({
  initiator: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: ['driver','commuter'], required: true },
  type: { type: String, enum: ['accident','manual','medical','other'], default: 'manual' },
  message: { type: String, required: true },
  location: { type: Object, default: {} },
  vehicle: { type: Object, default: {} },
  recipients: [recipientSchema],
}, { timestamps: true });

emergencyAlertSchema.index({ initiator: 1, createdAt: -1 });

module.exports = mongoose.model('EmergencyAlert', emergencyAlertSchema);