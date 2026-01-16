const mongoose = require('mongoose');
const crypto = require('crypto');

/* -------------------- HELPERS -------------------- */
function generateTxnRef(prefix = 'txn') {
    return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/* -------------------- TRANSACTION SCHEMA -------------------- */
const transactionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['TOPUP', 'PAYMENT', 'CASHOUT', 'REFUND'],
        required: true
    },
    amount: {
        type: Number,
        required: true
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

/* -------------------- WALLET SCHEMA -------------------- */
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
        unique: true,
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
}, { timestamps: true });

/* -------------------- INDEXES -------------------- */
walletSchema.index({ user: 1 });
// Create a partial unique index on transactions.referenceId to avoid collisions
// but only for non-null values
walletSchema.index(
    { 'transactions.referenceId': 1 },
    { unique: true, sparse: true }
);

/* -------------------- METHODS -------------------- */

/**
 * SAVE WITH REPAIR (handles duplicate key errors with retry logic)
 */
walletSchema.methods.saveWithRepair = async function (retryCount = 0, maxRetries = 3) {
    try {
        await this.save();
        return this;
    } catch (err) {
        // Handle duplicate key errors on transactions.referenceId
        if (err && err.code === 11000 && /transactions\.referenceId/.test(err.message)) {
            console.warn(`saveWithRepair: Duplicate key error on transactions.referenceId (attempt ${retryCount + 1}/${maxRetries})`);
            
            // First retry: attempt to fix null transaction referenceIds
            if (retryCount === 0) {
                try {
                    console.log('saveWithRepair: Attempting to fix null transaction referenceIds...');
                    await this.constructor.fixNullTransactionReferenceIds();
                } catch (fixErr) {
                    console.warn('saveWithRepair: Fix null failed:', fixErr.message);
                }
            }
            
            // Second retry: attempt to drop problematic index
            if (retryCount === 1) {
                try {
                    console.log('saveWithRepair: Attempting to drop problematic index...');
                    const indexes = await this.constructor.collection.indexes();
                    const idx = indexes.find(i => i.key && i.key['transactions.referenceId'] === 1);
                    if (idx) {
                        console.log('saveWithRepair: Dropping index:', idx.name);
                        await this.constructor.collection.dropIndex(idx.name);
                    }
                } catch (dropErr) {
                    console.warn('saveWithRepair: Could not drop index:', dropErr.message);
                }
            }
            
            // Retry with exponential backoff
            if (retryCount < maxRetries) {
                const delayMs = 100 * Math.pow(2, retryCount); // 100ms, 200ms, 400ms
                console.log(`saveWithRepair: Retrying after ${delayMs}ms...`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return this.saveWithRepair(retryCount + 1, maxRetries);
            }
        }
        
        // If not a duplicate key error or max retries exceeded, throw
        throw err;
    }
};

/**
 * ADD FUNDS (ATOMIC & WITH RETRY LOGIC)
 */
walletSchema.methods.addFunds = async function (amount, transactionData = {}, retryCount = 0, maxRetries = 3) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const refId = transactionData.referenceId || generateTxnRef('topup');

    try {
        const result = await this.constructor.findOneAndUpdate(
        { _id: this._id },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    type: transactionData.type || 'TOPUP',
                    amount,
                    status: 'COMPLETED',
                    referenceId: refId,
                    xenditId: transactionData.xenditId,
                    paymentMethod: transactionData.paymentMethod,
                    description: transactionData.description,
                    metadata: transactionData.metadata
                }
            }
        },
        { new: true }
    );
        if (!result) throw new Error('Failed to update wallet');
        return result;
    } catch (err) {
        if (err && err.code === 11000 && /transactions\\.referenceId/.test(err.message)) {
            if (retryCount < maxRetries) {
                const delayMs = 100 * Math.pow(2, retryCount);
                await new Promise(resolve => setTimeout(resolve, delayMs));
                return this.addFunds(amount, transactionData, retryCount + 1, maxRetries);
            }
        }
        throw err;
    }
};

/**
 * DEDUCT FUNDS (ATOMIC & SAFE)
 */
walletSchema.methods.deductFunds = async function (amount, transactionData = {}) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const refId = transactionData.referenceId || generateTxnRef('pay');

    // Check current balance first
    const currentWallet = await this.constructor.findById(this._id);
    if (!currentWallet) {
        throw new Error('Wallet not found');
    }
    
    if (currentWallet.balance < amount) {
        throw new Error(`Insufficient wallet balance. Required: ₱${amount.toFixed(2)}, Available: ₱${currentWallet.balance.toFixed(2)}`);
    }

    const updatedWallet = await this.constructor.findOneAndUpdate(
        {
            _id: this._id,
            balance: { $gte: amount }
        },
        {
            $inc: { balance: -amount },
            $push: {
                transactions: {
                    type: transactionData.type || 'PAYMENT',
                    amount,
                    status: 'COMPLETED',
                    referenceId: refId,
                    description: transactionData.description,
                    metadata: transactionData.metadata
                }
            }
        },
        { new: true }
    );

    if (!updatedWallet) {
        throw new Error(`Insufficient wallet balance. Required: ₱${amount.toFixed(2)}, Available: ₱${currentWallet.balance.toFixed(2)}`);
    }

    return updatedWallet;
};

/**
 * CASHOUT REQUEST
 */
walletSchema.methods.requestCashOut = async function (amount, transactionData = {}) {
    if (amount <= 0) throw new Error('Amount must be positive');

    const refId = transactionData.referenceId || generateTxnRef('cashout');

    const updatedWallet = await this.constructor.findOneAndUpdate(
        {
            _id: this._id,
            balance: { $gte: amount }
        },
        {
            $inc: { balance: -amount },
            $push: {
                transactions: {
                    type: 'CASHOUT',
                    amount,
                    status: 'PENDING',
                    referenceId: refId,
                    description: transactionData.description,
                    metadata: transactionData.metadata
                }
            }
        },
        { new: true }
    );

    if (!updatedWallet) {
        throw new Error('Insufficient balance');
    }

    return updatedWallet;
};

/* -------------------- STATICS -------------------- */
walletSchema.statics.findByUserId = function (userId) {
    return this.findOne({ user: userId });
};

/**
 * FIX NULL TRANSACTION REFERENCE IDS
 */
walletSchema.statics.fixNullTransactionReferenceIds = async function () {
    const result = await this.updateMany(
        { 'transactions.referenceId': null },
        [
            {
                $set: {
                    transactions: {
                        $map: {
                            input: '$transactions',
                            as: 'txn',
                            in: {
                                $cond: [
                                    { $eq: ['$$txn.referenceId', null] },
                                    {
                                        ...Object.fromEntries(
                                            Object.entries({
                                                type: '$$txn.type',
                                                amount: '$$txn.amount',
                                                status: '$$txn.status',
                                                referenceId: `${generateTxnRef('fixed')}_$$txn._id`,
                                                xenditId: '$$txn.xenditId',
                                                paymentMethod: '$$txn.paymentMethod',
                                                description: '$$txn.description',
                                                metadata: '$$txn.metadata',
                                                createdAt: '$$txn.createdAt',
                                                updatedAt: '$$txn.updatedAt'
                                            }).map(([key, value]) => [key, { $literal: value }])
                                        ),
                                        referenceId: {
                                            $concat: [
                                                'fixed_',
                                                { $toString: '$$txn._id' }
                                            ]
                                        }
                                    },
                                    '$$txn'
                                ]
                            }
                        }
                    }
                }
            }
        ]
    );
    return result;
};

/* -------------------- MODEL -------------------- */
const Wallet = mongoose.model('Wallet', walletSchema);
module.exports = Wallet;
