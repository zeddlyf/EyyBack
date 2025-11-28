const mongoose = require('mongoose')

const contactSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userType: { type: String, enum: ['commuter', 'driver'], required: true },
  name: { type: String, required: true, trim: true, minlength: 2 },
  phone: { type: String, required: true, trim: true, match: [/^[0-9+\-\s()]{10,}$/, 'Invalid phone number'] },
  email: { type: String, trim: true, default: '', match: [/^$|^\S+@\S+\.\S+$/, 'Invalid email'] },
  metadata: { type: Object, default: {} },
  isDeleted: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, { timestamps: true })

contactSchema.index({ owner: 1, userType: 1, isDeleted: 1 })

contactSchema.set('toJSON', { virtuals: true })
contactSchema.set('toObject', { virtuals: true })

const Contact = mongoose.model('Contact', contactSchema)

module.exports = Contact
