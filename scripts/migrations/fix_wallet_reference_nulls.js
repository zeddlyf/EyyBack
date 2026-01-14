/**
 * Migration script: fix_wallet_reference_nulls.js
 *
 * - Drops the old index on transactions.referenceId (if present)
 * - Finds wallets that contain transactions with referenceId === null or undefined
 * - For each such transaction, assigns a unique generated referenceId
 * - Let the app recreate the new partial index after restart (or run createIndexes)
 *
 * Usage: set MONGO_URI if needed, then run:
 *   node scripts/migrations/fix_wallet_reference_nulls.js
 */

const mongoose = require('mongoose');
const Wallet = require('../../models/Wallet');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    // Try to drop any existing index on transactions.referenceId to allow migration
    try {
      const indexes = await Wallet.collection.indexes();
      const idx = indexes.find(i => i.key && i.key['transactions.referenceId'] === 1);
      if (idx) {
        console.log('Dropping existing index:', idx.name);
        await Wallet.collection.dropIndex(idx.name);
      } else {
        console.log('No transactions.referenceId index found to drop');
      }
    } catch (err) {
      console.warn('Could not drop index (it may not exist or you may not have permissions):', err.message);
    }

    const wallets = await Wallet.find({ 'transactions.referenceId': null });
    console.log(`Found ${wallets.length} wallet(s) with null transaction referenceId`);

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
        console.log('Updated wallet:', wallet._id.toString());
      }
    }

    console.log('Migration complete. Restart the app to recreate the updated index.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
})();
