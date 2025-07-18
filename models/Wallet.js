/** this is the Wallet for payment */

const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    type: {
        type: String,
        required: true,
        trim: true
    },
    amount: {
        type: Number,
        required: true,
        min: [0, 'Amount must be positive']
    },
    currency: {
        type: String,
        default: 'PHP',
        uppercase: true,
        trim: true
    }
}, {
    timestamps: true // Adds createdAt and updatedAt fields
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;

