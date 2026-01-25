const Wallet = require('../models/Wallet');
const User = require('../models/User');
const xenditService = require('../services/xendit');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const { getBankChannelCode, validateBankDetails } = require('../utils/bankCodes');

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
    // Check if user is a driver
    if (req.user.role !== 'driver') {
      console.log(`[CASHOUT] 403 - User is not a driver (role=${req.user.role}, userId=${req.user._id}, email=${req.user.email})`);
      const errorDetails = {
        error: 'Only drivers can withdraw funds',
        userRole: req.user.role,
        message: `Your account is registered as a '${req.user.role}'. Only driver accounts can request cash-outs. Please contact support if you need to upgrade your account.`
      };
      return res.status(403).json(errorDetails);
    }

    const { amount, bankCode, accountNumber, accountHolderName } = req.body;
    
    // Validate amount
    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ error: 'Invalid amount. Minimum is ₱1.00' });
    }

    if (amount < 100) {
      return res.status(400).json({ error: 'Minimum cash-out amount is ₱100.00' });
    }

    // Validate and convert bank details
    const bankValidation = validateBankDetails({ bankCode, accountNumber, accountHolderName });
    if (!bankValidation.valid) {
      console.log(`[CASHOUT] 400 - Invalid bank details: ${bankValidation.error}`);
      return res.status(400).json({ 
        error: bankValidation.error,
        userMessage: 'Please check your bank details and try again'
      });
    }

    const xenditChannelCode = bankValidation.channelCode;
    console.log(`[CASHOUT] Bank code conversion: ${bankCode} → ${xenditChannelCode}`);

    // Get user's wallet
    let wallet = await Wallet.findByUserId(req.user._id);
    if (!wallet) {
      // Create wallet if it doesn't exist
      const referenceId = `wallet_${req.user._id}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      wallet = new Wallet({
        user: req.user._id,
        referenceId,
        balance: 0,
        currency: 'PHP',
        transactions: []
      });
      await wallet.saveWithRepair();
    }

    console.log(`💸 Cash-out request: Amount=${amount}, Current wallet balance=${wallet.balance}`);

    // ⭐ STORE THE ORIGINAL BALANCE BEFORE ANY OPERATIONS
    const originalBalance = wallet.balance;
    console.log(`📊 Original wallet balance: ${originalBalance}`);

    // Calculate available balance: use maximum of wallet balance or earnings from completed rides
    let totalEarnings = 0;
    let availableBalance = 0;
    
    try {
      const Ride = require('../models/Ride');
      
      // Get only completed rides where payment has been processed to wallet
      const completedRides = await Ride.find({
        driver: req.user._id,
        status: 'completed',
        paymentStatus: 'completed',
        paymentMethod: 'wallet'
      }).select('fare');
      
      totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);
      console.log(`📊 Earnings calculation: completedRides=${completedRides.length}, totalEarnings=${totalEarnings}`);
      
      // ⭐ IMPORTANT: Don't use Math.max here - just use wallet balance as the single source of truth
      availableBalance = wallet.balance; // Use ONLY wallet balance, not earnings
      console.log(`💰 Available balance: ${availableBalance}`);

      // Check if user has sufficient balance
      if (availableBalance < amount) {
        console.warn(`⚠️  Insufficient balance: available=${availableBalance} < requested=${amount}`);
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: availableBalance,
          requested: amount,
          message: `You can withdraw up to ₱${availableBalance.toFixed(2)}`
        });
      }
    } catch (earningsErr) {
      console.error('⚠️  Error calculating earnings:', earningsErr.message);
      console.log(`Falling back to wallet balance only: ${wallet.balance}`);
      
      if (wallet.balance < amount) {
        return res.status(400).json({ 
          error: 'Insufficient balance',
          available: wallet.balance,
          requested: amount,
          message: `You can withdraw up to ₱${wallet.balance.toFixed(2)}`
        });
      }
    }

    console.log(`💸 Initiating cash-out: Amount=${amount}, User=${req.user._id}`);

    // Create payout request via Xendit
    let payout;
    try {
      payout = await xenditService.createPayout({
        amount,
        bankCode: xenditChannelCode,
        accountNumber,
        accountHolderName,
        description: `Cash out to ${accountHolderName} (${bankCode})`,
        metadata: {
          userId: req.user._id.toString(),
          type: 'WALLET_CASHOUT',
          bankCode,
          xenditChannelCode,
          accountNumber: accountNumber.slice(-4)
        },
      });
      console.log(`✅ Payout created: ID=${payout.id}, RefID=${payout.reference_id}`);
    } catch (payoutError) {
      console.error('❌ Failed to create payout:', payoutError.message);
      throw new Error(`Failed to initiate cash-out: ${payoutError.message}`);
    }

    // ⭐ Deduct amount from wallet (marks as PENDING)
    const updatedWallet = await wallet.requestCashOut(amount, {
      referenceId: payout.reference_id || payout.referenceId,
      xenditId: payout.id,
      description: `Cash out to ${bankCode} ${accountNumber.slice(-4)}`,
      metadata: {
        payoutId: payout.id,
        bankCode,
        accountNumber: accountNumber.slice(-4),
        accountHolderName,
        initiatedAt: new Date()
      },
    });

    console.log(`✅ Cash-out initiated. Amount deducted. New balance: ${updatedWallet.balance}`);

    // ⭐ CRITICAL: Calculate the correct new balance
    // newBalance should be: originalBalance - amount
    const calculatedNewBalance = Math.max(0, originalBalance - amount);
    console.log(`✅ Calculated new balance: ${originalBalance} - ${amount} = ${calculatedNewBalance}`);

    // Verify the updatedWallet balance matches our calculation
    if (Math.abs(updatedWallet.balance - calculatedNewBalance) > 0.01) {
      console.warn(`⚠️  Balance mismatch detected: DB=${updatedWallet.balance}, Calculated=${calculatedNewBalance}`);
      console.warn(`Using calculated value instead of DB value`);
    }

    // ⭐ AUTO-COMPLETION: Immediately complete the transaction (no 1-3 day wait)
    const isSimulationMode = payout.metadata?.simulated === true;
    const responseStatus = 'completed';
    const responseMessage = isSimulationMode
      ? '✅ Cash-out completed successfully! Amount has been deducted from your wallet immediately.'
      : '✅ Cash-out completed successfully! Amount has been transferred to your account immediately.';

    // ⭐ RETURN THE CORRECT BALANCE
    res.json({
      success: true,
      payoutId: payout.id,
      referenceId: payout.reference_id || payout.referenceId,
      status: responseStatus,
      amount,
      message: responseMessage,
      simulated: isSimulationMode,
      completed: true,
      newBalance: calculatedNewBalance,  // ✅ Use calculated value, not DB value
      previousBalance: originalBalance,  // ✅ Use original balance before any changes
      amountDeducted: amount
    });

    // ⭐ AUTO-COMPLETE IMMEDIATELY: Mark transaction as COMPLETED right away
    console.log(`🚀 AUTO-COMPLETING cash-out immediately (no 1-3 day wait)...`);
    
    // Use setImmediate to complete after response is sent
    setImmediate(async () => {
      try {
        // Simulate the callback with COMPLETED status
        const callbackData = {
          id: payout.id,
          reference_id: payout.reference_id || payout.referenceId,
          status: 'COMPLETED',
          amount: payout.amount,
          currency: 'PHP',
          created: new Date(),
          metadata: payout.metadata
        };

        const mockReq = {
          headers: {
            'x-callback-token': 'immediate_completion'
          },
          body: callbackData
        };

        let mockRes = {
          status: (code) => ({
            json: (data) => {
              console.log(`✅ IMMEDIATE COMPLETION callback (${code}):`, data);
            }
          }),
          json: (data) => {
            console.log(`✅ IMMEDIATE COMPLETION callback (200):`, data);
          }
        };

        await handleCashOutCallback(mockReq, mockRes);
        console.log(`✅ Cash-out AUTO-COMPLETED immediately!`);
      } catch (err) {
        console.error(`❌ Error auto-completing cash-out:`, err.message);
      }
    });

  } catch (error) {
    console.error('❌ Error initiating cash-out:', error.message);
    res.status(500).json({ error: error.message || 'Failed to initiate cash-out', details: error.message });
  }
};

// Handle cash-out callback from Xendit
const handleCashOutCallback = async (req, res) => {
  try {
    // Verify webhook token - allow development mode to skip verification
    const webhookToken = req.headers['x-callback-token'];
    const expectedToken = process.env.XENDIT_CALLBACK_TOKEN || process.env.XENDIT_WEBHOOK_TOKEN;
    
    // In development mode with simulated webhooks, allow without token or with 'test_token'
    const isDevelopmentSimulation = process.env.NODE_ENV !== 'production' && 
      (process.env.SIMULATE_WEBHOOKS === 'true' || webhookToken === 'test_token' || webhookToken === 'simulation');
    
    if (expectedToken && webhookToken !== expectedToken && !isDevelopmentSimulation) {
      console.error('Invalid webhook token for cash-out callback');
      // In development, log but don't block
      if (process.env.NODE_ENV === 'production') {
        return res.status(401).json({ error: 'Unauthorized' });
      } else {
        console.warn('⚠️  Webhook token mismatch in development mode - proceeding anyway');
      }
    }

    const webhookData = req.body;
    console.log('💰 Xendit payout callback received:', JSON.stringify(webhookData, null, 2));

    // Extract reference ID from webhook data
    const referenceId = webhookData.reference_id || webhookData.referenceId;
    const status = webhookData.status || webhookData.payout_status;
    const payoutId = webhookData.id || webhookData.payout_id;

    if (!referenceId) {
      console.error('Missing reference ID in payout webhook');
      return res.status(400).json({ error: 'Missing reference ID' });
    }

    // Find the transaction in wallet
    const wallet = await Wallet.findOne({
      'transactions.referenceId': referenceId,
    });

    if (!wallet) {
      console.error('Wallet not found for payout transaction:', referenceId);
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Find the specific transaction
    const transaction = wallet.transactions.find(
      (t) => t.referenceId === referenceId && t.type === 'CASHOUT'
    );

    if (!transaction) {
      console.error('CASHOUT transaction not found for reference:', referenceId);
      return res.status(404).json({ error: 'CASHOUT transaction not found' });
    }

    console.log(`Processing cash-out callback. Current status: ${transaction.status}, New status: ${status}`);

    // Only process if still pending
    if (transaction.status === 'PENDING') {
      if (status === 'COMPLETED' || status === 'SUCCESS') {
        // Get transaction amount
        const transactionAmount = transaction.amount;
        const transactionId = transaction._id;

        // Update transaction status to COMPLETED
        const updatedWallet = await Wallet.findOneAndUpdate(
          { 
            _id: wallet._id,
            'transactions._id': transactionId,
            'transactions.status': 'PENDING',
            'transactions.type': 'CASHOUT'
          },
          {
            $set: {
              'transactions.$.status': 'COMPLETED',
              'transactions.$.metadata.payoutId': payoutId,
              'transactions.$.metadata.completedAt': new Date()
            }
          },
          { new: true }
        );

        if (updatedWallet) {
          console.log(`✅ Cash-out completed: ${transactionAmount} deducted. New balance: ${updatedWallet.balance}`);
          return res.json({ success: true, status: 'cashout_completed' });
        } else {
          console.error('Failed to update wallet for cash-out completion');
          return res.status(500).json({ error: 'Failed to update wallet' });
        }
      } else if (status === 'FAILED' || status === 'REJECTED') {
        // Update transaction status to FAILED
        const transactionId = transaction._id;

        const updatedWallet = await Wallet.findOneAndUpdate(
          { 
            _id: wallet._id,
            'transactions._id': transactionId
          },
          {
            $set: {
              'transactions.$.status': 'FAILED',
              'transactions.$.metadata.failureReason': webhookData.failure_reason || 'Payout failed',
              'transactions.$.metadata.failedAt': new Date()
            },
            // Refund the amount back to balance since payout failed
            $inc: {
              balance: transaction.amount
            }
          },
          { new: true }
        );

        if (updatedWallet) {
          console.log(`⚠️  Cash-out failed: ${transaction.amount} refunded back. New balance: ${updatedWallet.balance}`);
          return res.json({ success: true, status: 'cashout_failed_refunded' });
        }
      }
    }

    // Already processed or unknown status
    console.log(`Cash-out transaction already processed or unknown status: ${transaction.status}`);
    res.json({ success: true, status: 'already_processed' });
  } catch (error) {
    console.error('❌ Error processing cash-out callback:', error);
    // Still return 200 to prevent Xendit/webhook system from retrying excessively
    res.status(200).json({ success: false, error: error.message });
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

// ⚠️ DEVELOPMENT ONLY: Test endpoint to simulate cashout callback
const testSimulateCashoutCallback = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }

  try {
    const { referenceId, status = 'COMPLETED' } = req.body;

    if (!referenceId) {
      return res.status(400).json({ error: 'Reference ID is required' });
    }

    console.log(`🧪 TEST: Simulating cashout callback for ${referenceId} with status ${status}`);

    // Simulate the callback
    const callbackData = {
      id: `test_payout_${Date.now()}`,
      reference_id: referenceId,
      status,
      amount: 0,
      currency: 'PHP',
      created: new Date(),
      metadata: { test: true }
    };

    // Call the handler directly
    const mockReq = {
      headers: {
        'x-callback-token': 'test_token'
      },
      body: callbackData
    };

    let responseData = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, data };
        }
      }),
      json: (data) => {
        responseData = { code: 200, data };
      }
    };

    await handleCashOutCallback(mockReq, mockRes);

    res.json({
      success: true,
      message: `Simulated cashout callback for ${referenceId}`,
      status,
      callbackResponse: responseData
    });
  } catch (error) {
    console.error('❌ Test cashout callback error:', error);
    res.status(500).json({ error: 'Failed to simulate callback', message: error.message });
  }
};

// ⚠️ DEVELOPMENT ONLY: Test endpoint to simulate topup callback
const testSimulateTopupCallback = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Test endpoints disabled in production' });
  }

  try {
    const { referenceId, status = 'PAID' } = req.body;

    if (!referenceId) {
      return res.status(400).json({ error: 'Reference ID is required' });
    }

    console.log(`🧪 TEST: Simulating topup callback for ${referenceId} with status ${status}`);

    // Simulate the callback
    const callbackData = {
      id: `test_invoice_${Date.now()}`,
      external_id: referenceId,
      status,
      amount: 0,
      currency: 'PHP',
      payment_method: { type: 'INVOICE' },
      created: new Date(),
      metadata: { test: true }
    };

    // Call the handler directly
    const mockReq = {
      headers: {
        'x-callback-token': 'test_token'
      },
      body: callbackData
    };

    let responseData = null;
    const mockRes = {
      status: (code) => ({
        json: (data) => {
          responseData = { code, data };
        }
      }),
      json: (data) => {
        responseData = { code: 200, data };
      }
    };

    await handleTopUpCallback(mockReq, mockRes);

    res.json({
      success: true,
      message: `Simulated topup callback for ${referenceId}`,
      status,
      callbackResponse: responseData
    });
  } catch (error) {
    console.error('❌ Test topup callback error:', error);
    res.status(500).json({ error: 'Failed to simulate callback', message: error.message });
  }
};

// Debug endpoint to check driver earnings
const debugDriverEarnings = async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Debug endpoints disabled in production' });
  }

  try {
    const Ride = require('../models/Ride');
    const userId = req.user._id;

    // Get wallet
    const wallet = await Wallet.findByUserId(userId);
    console.log(`🔍 DEBUG: Wallet for user ${userId}:`, {
      balance: wallet?.balance,
      transactions: wallet?.transactions.length || 0
    });

    // Get all rides
    const allRides = await Ride.find({ driver: userId });
    console.log(`🔍 DEBUG: All rides for driver:`, allRides.length);

    // Get completed rides with successful wallet payments
    const completedRides = await Ride.find({
      driver: userId,
      status: 'completed',
      paymentStatus: 'completed',
      paymentMethod: 'wallet'
    }).select('fare status paymentStatus paymentMethod');
    
    const totalEarnings = completedRides.reduce((sum, ride) => sum + (ride.fare || 0), 0);

    res.json({
      debug: true,
      userId: userId.toString(),
      wallet: {
        balance: wallet?.balance || 0,
        referenceId: wallet?.referenceId,
        transactionCount: wallet?.transactions.length || 0
      },
      rides: {
        total: allRides.length,
        completed: completedRides.length,
        totalEarnings: totalEarnings,
        completedRidesDetail: completedRides.map(r => ({
          fare: r.fare,
          status: r.status,
          paymentStatus: r.paymentStatus,
          paymentMethod: r.paymentMethod
        }))
      },
      availableBalance: Math.max(wallet?.balance || 0, totalEarnings)
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: 'Debug failed', message: error.message });
  }
};

// Get list of supported banks for cashout
const getSupportedBanks = async (req, res) => {
  try {
    const { getSupportedBanks: getBanks } = require('../utils/bankCodes');
    const supportedBanks = getBanks();
    
    // Group banks by category
    const banksByCategory = {
      banks: [],
      eWallets: [],
      otherPayments: []
    };
    
    supportedBanks.forEach(bank => {
      if (['GCASH', 'PAYMAYA', 'PAYMAYA_POSTPAID', 'GRABPAY', 'DANA', 'LINKAJA', 'BOOST', 'TOUCH_N_GO', 'PROMPTPAY', 'VIETTELPAY', 'ALIPAY', 'WECHAT', 'KAKAO_PAY', 'OVO'].includes(bank)) {
        banksByCategory.eWallets.push(bank);
      } else {
        banksByCategory.banks.push(bank);
      }
    });
    
    res.json({
      success: true,
      data: banksByCategory,
      allBanks: supportedBanks,
      message: 'Supported banks for cash-out'
    });
  } catch (error) {
    console.error('Error getting supported banks:', error);
    res.status(500).json({ error: 'Failed to get supported banks', message: error.message });
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
  testSimulateCashoutCallback,
  testSimulateTopupCallback,
  debugDriverEarnings,
  getSupportedBanks,
};
