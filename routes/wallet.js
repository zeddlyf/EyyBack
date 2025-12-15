const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const walletController = require('../controllers/walletController');
const auth = require('../middleware/auth');

// Validation middleware
const validateTopUp = [
  body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('paymentMethod').optional().isString().withMessage('Payment method must be a string')
];

const validateCashOut = [
  body('amount').isNumeric().withMessage('Amount must be a number').isFloat({ min: 1 }).withMessage('Amount must be at least 1'),
  body('bankCode').isString().withMessage('Bank code is required'),
  body('accountNumber').isString().withMessage('Account number is required'),
  body('accountHolderName').isString().withMessage('Account holder name is required')
];

// Get wallet balance
router.get('/', auth, walletController.getWallet);

// Initialize wallet for user
router.post('/init', auth, walletController.initializeWallet);

// Top-up wallet
router.post('/topup', auth, validateTopUp, walletController.initiateTopUp);

// Handle Xendit top-up webhook (no auth required)
router.post('/webhook/topup', walletController.handleTopUpCallback);

// Cash-out from wallet
router.post('/cashout', auth, validateCashOut, walletController.initiateCashOut);

// Handle Xendit cash-out webhook (no auth required)
router.post('/webhook/cashout', walletController.handleCashOutCallback);

// Get transaction history
router.get('/transactions', auth, [
  param('page').optional().isInt({ min: 1 }).toInt(),
  param('limit').optional().isInt({ min: 1, max: 100 }).toInt()
], walletController.getTransactionHistory);

// Verify and update pending transaction (manual check)
router.post('/verify-transaction', auth, walletController.verifyTransaction);

module.exports = router;