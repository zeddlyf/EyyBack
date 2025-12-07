const Wallet = require('../models/Wallet');
const User = require('../models/User');
const xenditService = require('../services/xendit');
const { validationResult } = require('express-validator');

// Get wallet balance
const getWallet = async (req, res) => {
  try {
    const wallet = await Wallet.findByUserId(req.user._id);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    res.json(wallet);
  } catch (error) {
    console.error('Error getting wallet:', error);
    res.status(500).json({ error: 'Failed to get wallet' });
  }
};

// Initialize wallet for user
const initializeWallet = async (req, res) => {
  try {
    // Check if wallet already exists
    const existingWallet = await Wallet.findByUserId(req.user._id);
    if (existingWallet) {
      return res.status(400).json({ error: 'Wallet already exists' });
    }

    // Create new wallet
    const wallet = new Wallet({
      user: req.user._id,
      balance: 0,
      currency: 'PHP',
      transactions: []
    });

    await wallet.save();
    res.status(201).json(wallet);
  } catch (error) {
    console.error('Error initializing wallet:', error);
    res.status(500).json({ error: 'Failed to initialize wallet' });
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

    // Get user details
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine payment method type
    let paymentMethodType = paymentMethod || 'INVOICE';
    if (paymentMethodType === 'EWALLET') {
      paymentMethodType = 'EWALLET';
    } else if (paymentMethodType === 'INVOICE') {
      paymentMethodType = 'INVOICE';
    }

    // Create payment request using Xendit invoice for simplicity
    // For e-wallet, we'll use invoice which supports multiple payment methods
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

    res.json({
      success: true,
      paymentUrl: paymentRequest.invoice_url || paymentRequest.paymentUrl || paymentRequest.url,
      referenceId: paymentRequest.external_id || paymentRequest.referenceId || paymentRequest.id,
    });
  } catch (error) {
    console.error('Error initiating top-up:', error);
    res.status(500).json({ error: 'Failed to initiate top-up' });
  }
};

// Handle top-up callback from Xendit
const handleTopUpCallback = async (req, res) => {
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

    // Process the payment callback
    const callbackData = await xenditService.handlePaymentCallback(req.body);
    
    if (!callbackData.success) {
      return res.json({ success: false, status: 'payment_failed' });
    }

    // Find user's wallet
    const wallet = await Wallet.findByUserId(callbackData.metadata.userId);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Add funds to wallet
    await wallet.addFunds(callbackData.amount, {
      referenceId: callbackData.referenceId,
      xenditId: callbackData.paymentDetails.id,
      paymentMethod: callbackData.paymentMethod,
      description: `Top up ${callbackData.amount} ${callbackData.currency}`,
      metadata: callbackData.metadata,
    });

    res.json({ success: true, status: 'payment_completed' });
  } catch (error) {
    console.error('Error processing top-up callback:', error);
    res.status(500).json({ error: 'Failed to process top-up' });
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

// Get transaction history
const getTransactionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const wallet = await Wallet.findOne({ user: req.user._id });
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Get transactions with pagination
    const transactions = wallet.transactions
      .sort({ createdAt: -1 })
      .slice(skip, skip + parseInt(limit));

    res.json({
      total: wallet.transactions.length,
      page: parseInt(page),
      limit: parseInt(limit),
      transactions,
    });
  } catch (error) {
    console.error('Error getting transaction history:', error);
    res.status(500).json({ error: 'Failed to get transaction history' });
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
};
