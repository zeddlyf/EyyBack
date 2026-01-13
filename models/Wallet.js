const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['TOPUP', 'PAYMENT', 'CASHOUT', 'REFUND'],
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'],
        default: 'PENDING'
    },
    referenceId: {
        type: String,
        required: true
    },
    xenditId: String,
    paymentMethod: String,
    description: String,
    metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const walletSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    balance: {
        type: Number,
        default: 0,
        min: 0
    },
    currency: {
        type: String,
        default: 'PHP',
        uppercase: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    transactions: [transactionSchema]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Add index for faster lookups
walletSchema.index({ user: 1 });
// Only enforce uniqueness for transactions that actually have a referenceId.
// Use a partial index so documents without transactions or without referenceId
// (null/undefined) won't collide on the unique constraint.
walletSchema.index(
  { 'transactions.referenceId': 1 },
  { unique: true, partialFilterExpression: { 'transactions.referenceId': { $exists: true } } }
);

// Method to add funds to wallet
walletSchema.methods.addFunds = async function(amount, transactionData) {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    const transaction = {
        type: 'TOPUP',
        amount,
        status: 'COMPLETED',
        referenceId: transactionData.referenceId,
        xenditId: transactionData.xenditId,
        paymentMethod: transactionData.paymentMethod,
        description: transactionData.description,
        metadata: transactionData.metadata
    };

    this.balance += amount;
    this.transactions.push(transaction);
    
    await this.save();
    return this;
};

// Method to deduct funds from wallet
walletSchema.methods.deductFunds = async function(amount, transactionData) {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    if (this.balance < amount) {
        throw new Error('Insufficient balance');
    }

    const transaction = {
        type: transactionData.type || 'PAYMENT',
        amount: -amount, // Store as negative for deductions
        status: 'COMPLETED',
        referenceId: transactionData.referenceId,
        description: transactionData.description,
        metadata: transactionData.metadata
    };

    this.balance -= amount;
    this.transactions.push(transaction);
    
    await this.save();
    return this;
};

// Method to request cash out
walletSchema.methods.requestCashOut = async function(amount, transactionData) {
    if (amount <= 0) {
        throw new Error('Amount must be positive');
    }
    
    if (this.balance < amount) {
        throw new Error('Insufficient balance');
    }

    const transaction = {
        type: 'CASHOUT',
        amount: -amount,
        status: 'PENDING', // Will be updated when Xendit processes the payout
        referenceId: transactionData.referenceId,
        description: transactionData.description,
        metadata: transactionData.metadata
    };

    this.balance -= amount;
    this.transactions.push(transaction);
    
    await this.save();
    return this;
};

// Static method to get wallet by user ID
walletSchema.statics.findByUserId = function(userId) {
    return this.findOne({ user: userId });
};

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;

