const axios = require('axios')

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

module.exports = {
  createInvoice,
  getInvoice,
  createEwalletCharge,
  getEwalletCharge,
  createCardCharge,
  getCardCharge,
  verifyWebhook
}

