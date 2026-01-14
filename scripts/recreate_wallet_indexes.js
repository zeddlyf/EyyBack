const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

(async () => {
  try {
    await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected to MongoDB');

    console.log('Syncing Wallet indexes...');
    const res = await Wallet.syncIndexes();
    console.log('syncIndexes result:', res);

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to sync wallets indexes:', err);
    process.exit(1);
  }
})();