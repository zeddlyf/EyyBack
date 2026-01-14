/**
 * Migration script: backfill_wallet_reference_ids.js
 *
 * - Finds wallets missing `referenceId` and assigns a unique generated one.
 *
 * Usage: set MONGO_URI if needed, then run:
 *   node scripts/migrations/backfill_wallet_reference_ids.js
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const Wallet = require('../../models/Wallet');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    const wallets = await Wallet.find({ $or: [{ referenceId: { $exists: false } }, { referenceId: null }] });
    console.log(`Found ${wallets.length} wallet(s) missing referenceId`);

    for (const wallet of wallets) {
      const generated = `wallet_${crypto.randomBytes(12).toString('hex')}`;
      wallet.referenceId = generated;
      await wallet.save();
      console.log(`Assigned referenceId ${generated} to wallet ${wallet._id}`);
    }

    console.log('Backfill complete.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();