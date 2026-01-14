const Wallet = require('../models/Wallet');
const User = require('../models/User');
const xenditService = require('../services/xendit');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

// Get wallet balance
const getWallet = async (req, res) => {
  try {
    let wallet = await Wallet.findByUserId(req.user._id);
    
    if (!wallet) {
      // Return default structure if wallet doesn't exist
      return res.json({
        amount: 0,
        balance: 0,
        currency: 'PHP'
      });
    }

    // Return wallet with both amount and balance for frontend compatibility
    res.json({
      _id: wallet._id,
      id: wallet._id,
      userId: wallet.user,
      amount: wallet.balance || 0,
      balance: wallet.balance || 0,
      currency: wallet.currency || 'PHP',
      referenceId: wallet.referenceId || null
    });
  } catch (error) {
    console.error('Error getting wallet:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
};

// Helper: save a wallet and attempt automated repair if a transactions.referenceId unique-index collision occurs
async function saveWalletWithRepair(wallet) {
  try {
    await wallet.save();
    return;
  } catch (err) {
    if (err && err.code === 11000 && /transactions\.referenceId/.test(err.message)) {
      console.warn('saveWalletWithRepair: detected duplicate key on transactions.referenceId — attempting repair');
      try {
        // Try model-level repair first
        await Wallet.fixNullTransactionReferenceIds();
      } catch (e) {
        console.warn('saveWalletWithRepair: model repair failed:', e.message);
      }
      // Try dropping any leftover plain index explicitly (best-effort)
      try {
        const indexes = await Wallet.collection.indexes();
        const idx = indexes.find(i => i.key && i.key['transactions.referenceId'] === 1);
        if (idx) {
          console.log('saveWalletWithRepair: dropping index', idx.name);
          await Wallet.collection.dropIndex(idx.name);
        }
      } catch (dropErr) {
        console.warn('saveWalletWithRepair: could not drop index directly:', dropErr.message);
      }

      // Retry save once
      await wallet.save();
      return;
    }
    throw err;
  }
}

// Initialize wallet for user
const initializeWallet = async (req, res) => {
  try {
    // Check if wallet already exists
    let wallet = await Wallet.findByUserId(req.user._id);
    
    if (wallet) {
      return res.json({
        _id: wallet._id,
        id: wallet._id,
        amount: wallet.balance || 0,
        balance: wallet.balance || 0
      });
    }

    // Create new wallet
    const referenceId = `wallet_${req.user._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    wallet = new Wallet({
      user: req.user._id,
      referenceId,
      balance: 0,
      currency: 'PHP',
      transactions: []
    });

    await saveWalletWithRepair(wallet);
    res.json({
      _id: wallet._id,
      id: wallet._id,
      amount: 0,
      balance: 0,
      referenceId: wallet.referenceId || null
    });
  } catch (error) {
    console.error('Error initializing wallet:', error);
    res.status(500).json({ error: 'Failed to initialize wallet', message: error.message });
  }
};

// Initiate top-up
const initiateTopUp = async (req, res) => {
  try {
    const { amount, paymentMethod } = req.body;
    
    // Validate amount
    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Get or create wallet
    let wallet = await Wallet.findByUserId(req.user._id);
    if (!wallet) {
      const referenceId = `wallet_${req.user._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      wallet = new Wallet({
        user: req.user._id,
        referenceId,
        balance: 0,
        currency: 'PHP',
        transactions: []
      });
      await saveWalletWithRepair(wallet);
    }

    // Get user details
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create payment request using Xendit
    const paymentRequest = await xenditService.createInvoice({
      amount,
      currency: 'PHP',
      description: `Wallet top-up of ₱${amount}`,
      external_id: `topup_${user._id}_${Date.now()}`,
      customer: {
        email: user.email,
        given_names: user.firstName,
        surname: user.lastName,
        mobile_number: user.phoneNumber
      }
    });

    // Create pending transaction record BEFORE payment
    const referenceId = paymentRequest.external_id || paymentRequest.id || `topup_${user._id}_${Date.now()}`;
    const xenditId = paymentRequest.id || paymentRequest.invoice_id;
    
    const transaction = {
      type: 'TOPUP',
      amount: amount,
      status: 'PENDING',
      referenceId: referenceId,
      xenditId: xenditId,
      paymentMethod: paymentMethod || 'INVOICE',
      description: `Wallet top-up of ₱${amount}`,
      metadata: {
        userId: user._id.toString(),
        paymentRequestId: paymentRequest.id
      }
    };

    wallet.transactions.push(transaction);
    await wallet.save();

    res.json({
      paymentUrl: paymentRequest.invoice_url || paymentRequest.paymentUrl || paymentRequest.url,
      url: paymentRequest.invoice_url || paymentRequest.paymentUrl || paymentRequest.url,
      referenceId: referenceId,
      id: xenditId
    });
  } catch (error) {
    console.error('Error initiating top-up:', error);
    res.status(500).json({ error: 'Failed to initiate top-up', message: error.message });
  }
};

// Handle top-up callback from Xendit
const handleTopUpCallback = async (req, res) => {
  try {
    // Verify webhook token (Xendit sends callback token in header)
    const webhookToken = req.headers['x-callback-token'];
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN || process.env.XENDIT_WEBHOOK_TOKEN;
    
    console.log('Webhook received - Token check:', {
      hasToken: !!webhookToken,
      hasExpectedToken: !!expectedToken,
      tokenMatch: webhookToken === expectedToken
    });
    
    // Only verify token if it's set in environment
    if (expectedToken && webhookToken !== expectedToken) {
      console.error('Invalid webhook token - Expected:', expectedToken?.substring(0, 10) + '...', 'Received:', webhookToken?.substring(0, 10) + '...');
      // In development, log but don't block (for testing)
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
      } else {
        console.warn('⚠️  Webhook token mismatch in development mode - proceeding anyway');
      }
    }

    const webhookData = req.body;
    console.log('Xendit webhook received:', JSON.stringify(webhookData, null, 2));

    // Handle invoice webhook (Xendit sends invoice status updates)
    const invoiceId = webhookData.id || webhookData.invoice_id;
    const status = webhookData.status || webhookData.payment_status;
    const externalId = webhookData.external_id || webhookData.reference_id;

    if (!invoiceId && !externalId) {
      console.error('Missing invoice ID or external ID in webhook');
      return res.status(400).json({ error: 'Missing invoice ID or external ID' });
    }

    // Find transaction by xenditId or referenceId
    let wallet = null;
    let transaction = null;

    if (invoiceId) {
      // Try to find by xenditId first
      wallet = await Wallet.findOne({ 'transactions.xenditId': invoiceId });
      if (wallet) {
        transaction = wallet.transactions.find(t => t.xenditId === invoiceId);
      }
    }

    if (!transaction && externalId) {
      // Try to find by referenceId
      wallet = await Wallet.findOne({ 'transactions.referenceId': externalId });
      if (wallet) {
        transaction = wallet.transactions.find(t => t.referenceId === externalId);
      }
    }

    if (!wallet || !transaction) {
      console.error('Transaction not found for webhook:', { invoiceId, externalId });
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Only process if still pending
    if (transaction.status === 'PENDING') {
      if (status === 'PAID' || status === 'COMPLETED' || webhookData.status === 'PAID') {
        // Get transaction amount before update
        const transactionAmount = transaction.amount;
        
        // Find the transaction by its ID in the array
        const transactionId = transaction._id;
        
        if (!transactionId) {
          console.error('Transaction _id not found');
          // Fallback: use referenceId or xenditId to find and update
          const updateResult = await Wallet.updateOne(
            { 
              _id: wallet._id,
              'transactions.referenceId': externalId || transaction.referenceId
            },
            {
              $set: {
                'transactions.$[tx].status': 'COMPLETED'
              },
              $inc: {
                balance: transactionAmount
              }
            },
            {
              arrayFilters: [{ 'tx.referenceId': externalId || transaction.referenceId }]
            }
          );
          
          if (updateResult.modifiedCount > 0) {
            console.log(`Wallet ${wallet._id} updated via fallback. Balance increased by ${transactionAmount}`);
            return res.json({ success: true, status: 'payment_completed' });
          } else {
            return res.status(500).json({ error: 'Failed to update wallet' });
          }
        }

        // Use findOneAndUpdate with transaction _id for atomic update
        const updateResult = await Wallet.findOneAndUpdate(
          { 
            _id: wallet._id,
            'transactions._id': transactionId,
            'transactions.status': 'PENDING' // Only update if still pending
          },
          {
            $set: {
              'transactions.$.status': 'COMPLETED'
            },
            $inc: {
              balance: transactionAmount
            }
          },
          { new: true } // Return updated document
        );

        if (!updateResult) {
          console.error('Failed to update wallet - transaction may have been already processed');
          // Try to check if it was already completed
          const checkWallet = await Wallet.findById(wallet._id);
          const checkTransaction = checkWallet?.transactions.find(
            t => (t.xenditId === invoiceId) || (t.referenceId === externalId)
          );
          
          if (checkTransaction && checkTransaction.status === 'COMPLETED') {
            console.log('Transaction already completed');
            return res.json({ success: true, status: 'already_processed' });
          }
          
          return res.status(500).json({ error: 'Failed to update wallet' });
        }

        console.log(`Wallet ${updateResult._id} updated. New balance: ${updateResult.balance}, Amount added: ${transactionAmount}`);
        
        return res.json({ success: true, status: 'payment_completed' });
      } else if (status === 'EXPIRED' || status === 'FAILED') {
        // Update transaction status to failed
        const transactionId = transaction._id;
        
        if (transactionId) {
          await Wallet.findOneAndUpdate(
            { 
              _id: wallet._id,
              'transactions._id': transactionId
            },
            {
              $set: {
                'transactions.$.status': 'FAILED'
              }
            }
          );
        } else {
          // Fallback update
          await Wallet.updateOne(
            { 
              _id: wallet._id,
              'transactions.referenceId': externalId || transaction.referenceId
            },
            {
              $set: {
                'transactions.$[tx].status': 'FAILED'
              }
            },
            {
              arrayFilters: [{ 'tx.referenceId': externalId || transaction.referenceId }]
            }
          );
        }
        return res.json({ success: true, status: 'payment_failed' });
      }
    }

    // Already processed
    res.json({ success: true, status: 'already_processed' });
  } catch (error) {
    console.error('Error processing top-up callback:', error);
    // Still return 200 to prevent Xendit from retrying
    res.status(200).json({ success: false, error: error.message });
  }
};

// Initiate cash-out
const initiateCashOut = async (req, res) => {
  try {
    const { amount, bankCode, accountNumber, accountHolderName } = req.body;
    
    // Validate amount
    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // Get user's wallet
    const wallet = await Wallet.findByUserId(req.user._id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Check if user has sufficient balance
    if (wallet.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Create payout request
    const payout = await xenditService.createPayout({
      amount,
      bankCode,
      accountNumber,
      accountHolderName,
      description: 'Cash out from wallet',
      metadata: {
        userId: req.user._id,
        type: 'WALLET_CASHOUT',
      },
    });

    // Deduct amount from wallet
    await wallet.requestCashOut(amount, {
      referenceId: payout.referenceId,
      description: `Cash out to ${bankCode} ${accountNumber}`,
      metadata: {
        payoutId: payout.id,
        bankCode,
        accountNumber: accountNumber.slice(-4), // Only store last 4 digits
      },
    });

    res.json({
      success: true,
      payoutId: payout.id,
      referenceId: payout.referenceId,
      status: 'pending',
    });
  } catch (error) {
    console.error('Error initiating cash-out:', error);
    res.status(500).json({ error: 'Failed to initiate cash-out' });
  }
};

// Handle cash-out callback from Xendit
const handleCashOutCallback = async (req, res) => {
  try {
    // Verify webhook signature
    const signature = req.headers['x-callback-token'];
    const isValid = xenditService.verifyWebhookSignature(
      signature,
      req.body,
      process.env.XENDIT_CALLBACK_TOKEN
    );

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Process the payout callback
    const callbackData = await xenditService.handlePayoutCallback(req.body);
    
    // Find the transaction in wallet
    const wallet = await Wallet.findOne({
      'transactions.referenceId': callbackData.referenceId,
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Update transaction status
    const transaction = wallet.transactions.find(
      (t) => t.referenceId === callbackData.referenceId
    );

    if (transaction) {
      transaction.status = callbackData.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED';
      await wallet.save();
    }

    res.json({ success: true, status: 'payout_processed' });
  } catch (error) {
    console.error('Error processing cash-out callback:', error);
    res.status(500).json({ error: 'Failed to process cash-out' });
  }
};

// Verify and update pending transaction (manual check)
const verifyTransaction = async (req, res) => {
  try {
    const { referenceId, xenditId } = req.body;
    
    if (!referenceId && !xenditId) {
      return res.status(400).json({ error: 'referenceId or xenditId is required' });
    }

    // Find wallet with this transaction
    let wallet = await Wallet.findOne({
      $or: [
        { 'transactions.referenceId': referenceId },
        { 'transactions.xenditId': xenditId }
      ]
    });

    if (!wallet) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    const transaction = wallet.transactions.find(
      t => (referenceId && t.referenceId === referenceId) || (xenditId && t.xenditId === xenditId)
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // If already completed, return current status
    if (transaction.status === 'COMPLETED') {
      return res.json({
        success: true,
        status: 'completed',
        balance: wallet.balance,
        transaction: transaction
      });
    }

    // If pending, check with Xendit API
    if (transaction.status === 'PENDING' && transaction.xenditId) {
      try {
        const invoice = await xenditService.getInvoice(transaction.xenditId);
        
        if (invoice.status === 'PAID' || invoice.status === 'COMPLETED') {
          // Update transaction and balance
          const transactionId = transaction._id;
          const transactionAmount = transaction.amount;

          const updatedWallet = await Wallet.findOneAndUpdate(
            { 
              _id: wallet._id,
              'transactions._id': transactionId,
              'transactions.status': 'PENDING'
            },
            {
              $set: {
                'transactions.$.status': 'COMPLETED'
              },
              $inc: {
                balance: transactionAmount
              }
            },
            { new: true }
          );

          if (updatedWallet) {
            return res.json({
              success: true,
              status: 'updated',
              balance: updatedWallet.balance,
              message: 'Transaction verified and wallet updated'
            });
          }
        }
      } catch (xenditError) {
        console.error('Error checking Xendit invoice:', xenditError);
      }
    }

    res.json({
      success: true,
      status: transaction.status.toLowerCase(),
      balance: wallet.balance,
      transaction: transaction
    });
  } catch (error) {
    console.error('Error verifying transaction:', error);
    res.status(500).json({ error: 'Failed to verify transaction', message: error.message });
  }
};

// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.json([]); // Return empty array if no wallet
    }

    // Get transactions with pagination and sort by date (newest first)
    const allTransactions = wallet.transactions || [];
    const sortedTransactions = [...allTransactions].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.timestamp || 0);
      const dateB = new Date(b.createdAt || b.timestamp || 0);
      return dateB - dateA;
    });

    const transactions = sortedTransactions.slice(skip, skip + parseInt(limit));

    // Format transactions for frontend
    const formattedTransactions = transactions.map(tx => ({
      _id: tx._id || tx.id,
      id: tx._id || tx.id,
      type: tx.type === 'TOPUP' ? 'deposit' : (tx.type === 'CASHOUT' ? 'withdrawal' : tx.type?.toLowerCase() || 'payment'),
      amount: Math.abs(tx.amount), // Frontend expects positive amounts
      status: tx.status?.toLowerCase() || 'completed',
      description: tx.description || `Transaction ${tx.type}`,
      createdAt: tx.createdAt || tx.timestamp,
      completedAt: tx.status === 'COMPLETED' ? (tx.updatedAt || tx.createdAt) : null,
      referenceId: tx.referenceId,
      xenditId: tx.xenditId,
      paymentMethod: tx.paymentMethod
    }));

    // Return as array (frontend expects array or { transactions: [] })
    res.json(formattedTransactions);
  } catch (error) {
    console.error('Error getting transaction history:', error);
    res.status(500).json({ error: 'Failed to get transaction history', message: error.message });
  }
};

module.exports = {
  getWallet,
  initializeWallet,
  initiateTopUp,
  handleTopUpCallback,
  initiateCashOut,
  handleCashOutCallback,
  getTransactionHistory,
  verifyTransaction,
};
