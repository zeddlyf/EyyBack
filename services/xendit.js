const axios = require('axios')
const crypto = require('crypto')

const base = 'https://api.xendit.co'

function auth() {
  const key = process.env.XENDIT_API_KEY || ''
  const basic = Buffer.from(`${key}:`).toString('base64')
  return { Authorization: `Basic ${basic}` }
}

async function createInvoice({ amount, currency = 'PHP', description, external_id, customer }) {
  const res = await axios.post(`${base}/v2/invoices`, {
    amount,
    currency,
    description,
    external_id,
    customer
  }, { headers: { 'Content-Type': 'application/json', ...auth() }, timeout: 10000 })
  return res.data
}

async function getInvoice(id) {
  const res = await axios.get(`${base}/v2/invoices/${id}`, { headers: auth(), timeout: 10000 })
  return res.data
}

async function createEwalletCharge({ reference_id, amount, channel_code, currency = 'PHP', checkout_method = 'ONE_TIME_PAYMENT' }) {
  const res = await axios.post(`${base}/ewallets/charges`, {
    reference_id,
    amount,
    currency,
    channel_code,
    checkout_method
  }, { headers: { 'Content-Type': 'application/json', ...auth() }, timeout: 10000 })
  return res.data
}

async function getEwalletCharge(id) {
  const res = await axios.get(`${base}/ewallets/charges/${id}`, { headers: auth(), timeout: 10000 })
  return res.data
}

async function createCardCharge({ token_id, amount, currency = 'PHP', capture = true, external_id }) {
  const res = await axios.post(`${base}/credit_card/charges`, {
    token_id,
    amount,
    currency,
    capture,
    external_id
  }, { headers: { 'Content-Type': 'application/json', ...auth() }, timeout: 10000 })
  return res.data
}

async function getCardCharge(id) {
  const res = await axios.get(`${base}/credit_card/charges/${id}`, { headers: auth(), timeout: 10000 })
  return res.data
}

function verifyWebhook(req) {
  const token = req.headers['x-callback-token'] || ''
  const expected = process.env.XENDIT_CALLBACK_TOKEN || ''
  return expected && token && token === expected
}

// Helper to generate unique IDs
function generateReferenceId(prefix = '') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}${timestamp}${random}`;
}

// Generate Xendit callback signature
function generateCallbackSignature(secret, payload) {
  return crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');
}

// Get authentication headers
function getAuthHeaders() {
  const key = process.env.XENDIT_API_KEY || '';
  const basic = Buffer.from(`${key}:`).toString('base64');
  return { 
    'Authorization': `Basic ${basic}`,
    'Content-Type': 'application/json'
  };
}

// Create a payment request for top-up
async function createPaymentRequest({ amount, currency = 'PHP', paymentMethod, user, metadata = {} }) {
  const referenceId = generateReferenceId('topup_');
  const description = `Top up ${amount} ${currency} to wallet`;
  
  const payload = {
    amount,
    currency,
    reference_id: referenceId,
    payment_method: paymentMethod,
    description,
    customer: {
      email: user.email,
      given_names: user.firstName,
      surname: user.lastName,
      mobile_number: user.phoneNumber
    },
    metadata: {
      ...metadata,
      userId: user._id.toString(),
      type: 'WALLET_TOPUP'
    },
    success_redirect_url: `${process.env.APP_URL}/wallet/topup/success`,
    failure_redirect_url: `${process.env.APP_URL}/wallet/topup/failed`,
  };

  const response = await axios.post(
    `${base}/payment_requests`,
    payload,
    { headers: getAuthHeaders(), timeout: 10000 }
  );

  return {
    ...response.data,
    referenceId,
    paymentUrl: response.data.invoice_url || response.data.payment_url || response.data.checkout_url || response.data.url
  };
}

// Create a payout to a bank account
async function createPayout({ amount, accountHolderName, accountNumber, bankCode, description, metadata = {} }) {
  const referenceId = generateReferenceId('payout_');
  
  const payload = {
    reference_id: referenceId,
    amount,
    currency: 'PHP',
    channel_code: bankCode,
    channel_properties: {
      account_holder_name: accountHolderName,
      account_number: accountNumber,
    },
    description: description || 'Cash out from wallet',
    metadata: {
      ...metadata,
      type: 'WALLET_CASHOUT'
    }
  };

  const response = await axios.post(
    `${base}/payouts`,
    payload,
    { headers: getAuthHeaders(), timeout: 15000 }
  );

  return {
    ...response.data,
    referenceId
  };
}

// Get payment request status
async function getPaymentRequest(id) {
  const response = await axios.get(
    `${base}/payment_requests/${id}`,
    { headers: getAuthHeaders(), timeout: 5000 }
  );
  return response.data;
}

// Get payout status
async function getPayout(id) {
  const response = await axios.get(
    `${base}/payouts/${id}`,
    { headers: getAuthHeaders(), timeout: 5000 }
  );
  return response.data;
}

// Verify webhook signature
function verifyWebhookSignature(signature, payload, secret) {
  const expectedSignature = generateCallbackSignature(secret, JSON.stringify(payload));
  return signature === expectedSignature;
}

// Handle payment callback
async function handlePaymentCallback(payload) {
  const { id, status, reference_id: referenceId, metadata } = payload;
  
  // Get the full payment details
  const payment = await getPaymentRequest(id);
  
  return {
    success: status === 'PAID',
    referenceId: payment.reference_id,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    paymentMethod: payment.payment_method?.type,
    metadata: payment.metadata,
    paymentDetails: payment
  };
}

// Handle payout callback
async function handlePayoutCallback(payload) {
  const { id, status, reference_id: referenceId } = payload;
  
  // Get the full payout details
  const payout = await getPayout(id);
  
  return {
    success: status === 'COMPLETED',
    referenceId: payout.reference_id,
    amount: payout.amount,
    currency: payout.currency,
    status: payout.status,
    metadata: payout.metadata,
    payoutDetails: payout
  };
}

module.exports = {
  createInvoice,
  getInvoice,
  createEwalletCharge,
  getEwalletCharge,
  createCardCharge,
  getCardCharge,
  verifyWebhook,
  // Payment methods
  createPaymentRequest,
  getPaymentRequest,
  
  // Payout methods
  createPayout,
  getPayout,
  
  // Callback handlers
  handlePaymentCallback,
  handlePayoutCallback,
  
  // Utility
  verifyWebhookSignature,
  generateReferenceId
};
