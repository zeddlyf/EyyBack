const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ride: { type: mongoose.Schema.Types.ObjectId, ref: 'Ride' },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet' },
    amount: { type: Number, required: true, min: [0, 'Amount must be positive'] },
    currency: { type: String, default: 'PHP' },
    method: { type: String, enum: ['invoice', 'ewallet', 'va', 'qr', 'credit_card'], default: 'invoice' },
    channel: { type: String },
    status: { type: String, enum: ['PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'EXPIRED'], default: 'PENDING' },
    provider: { type: String, default: 'xendit' },
    providerId: { type: String },
    description: { type: String },
    errorCode: { type: String },
    errorMessage: { type: String },
    metadata: { type: Object },
    webhookPayloadEnc: { type: String },
    date: { type: Date, default: Date.now }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
