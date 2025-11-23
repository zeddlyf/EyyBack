const mongoose = require('mongoose');

const driverLocationSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  status: { type: String, enum: ['available', 'on-trip'], default: 'available' },
  hasPassenger: { type: Boolean, default: false },
  rideId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', default: null },
}, { timestamps: true });

driverLocationSchema.index({ location: '2dsphere' });
driverLocationSchema.index({ driver: 1, createdAt: -1 });

module.exports = mongoose.model('DriverLocation', driverLocationSchema);