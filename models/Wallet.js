const mongoose = require('mongoose');
const crypto = require('crypto');

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
    referenceId: {
        type: String,
        required: true,
        default: () => `wallet_${crypto.randomBytes(12).toString('hex')}`
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

// Ensure wallet.referenceId includes user ID when possible to guarantee per-user uniqueness
walletSchema.pre('validate', function(next) {
    try {
        if (!this.referenceId) {
            if (this.user) {
                this.referenceId = `wallet_${this.user}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
            } else {
                this.referenceId = `wallet_${Date.now()}_${crypto.randomBytes(12).toString('hex')}`;
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});
// Add index for faster lookups
walletSchema.index({ user: 1 });
// Add unique index for wallet referenceId (partial so existing docs without referenceId are ignored)
walletSchema.index({ referenceId: 1 }, { unique: true, partialFilterExpression: { referenceId: { $exists: true, $ne: null } } });
// Only enforce uniqueness for transactions that actually have a referenceId.
// Use a partial index so documents without transactions, or with null/undefined
// referenceId values won't be included in the unique constraint.
// Note: $exists:true matches null values, so include $ne:null to exclude them.
walletSchema.index(
  { 'transactions.referenceId': 1 },
  { unique: true, partialFilterExpression: { 'transactions.referenceId': { $exists: true, $ne: null } } }
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

// Static helper to fix wallets containing transactions with null/undefined referenceIds
// Drops any old index on transactions.referenceId, assigns generated IDs to null transactions,
// and saves updated wallets. Returns the number of wallets updated.
walletSchema.statics.fixNullTransactionReferenceIds = async function() {
    const Model = this;
    try {
        // Attempt to drop any existing (bad) index on transactions.referenceId
        try {
            const indexes = await Model.collection.indexes();
            const idx = indexes.find(i => i.key && i.key['transactions.referenceId'] === 1);
            if (idx) {
                console.log('fixNullTransactionReferenceIds: Dropping index', idx.name);
                await Model.collection.dropIndex(idx.name);
            } else {
                console.log('fixNullTransactionReferenceIds: No transactions.referenceId index found');
            }
        } catch (dropErr) {
            console.warn('fixNullTransactionReferenceIds: Could not drop index (may not exist or insufficient permissions):', dropErr.message);
        }

        // Find wallets that contain null/undefined transaction referenceIds
        const wallets = await Model.find({ 'transactions.referenceId': null });
        console.log(`fixNullTransactionReferenceIds: Found ${wallets.length} wallet(s) with null transaction referenceId`);

        let updatedCount = 0;
        for (const wallet of wallets) {
            let modified = false;
            wallet.transactions.forEach((t, i) => {
                if (t && (t.referenceId === null || t.referenceId === undefined)) {
                    t.referenceId = `migrated_${wallet._id}_${Date.now()}_${i}`;
                    modified = true;
                }
            });
            if (modified) {
                await wallet.save();
                updatedCount++;
                console.log('fixNullTransactionReferenceIds: Updated wallet', wallet._id.toString());
            }
        }

        return updatedCount;
    } catch (err) {
        console.error('fixNullTransactionReferenceIds: failed', err);
        throw err;
    }
};

// Prevent saving transactions with null/undefined referenceId values
walletSchema.pre('save', function(next) {
    if (this.transactions && Array.isArray(this.transactions)) {
        const bad = this.transactions.some(t => t.referenceId === null || t.referenceId === undefined);
        if (bad) {
            return next(new Error('transactions.referenceId cannot be null or undefined'));
        }
    }
    next();
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;

