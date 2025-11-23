const axios = require('axios');

const BASE = process.env.PHILSMS_API_BASE || 'https://dashboard.philsms.com/api/v3/';
const TOKEN = process.env.PHILSMS_API_TOKEN || '';

async function sendSMS(to, body) {
  if (!TOKEN) throw new Error('SMS token missing');
  const url = BASE.replace(/\/$/, '') + '/sms/send';
  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
  const payload = { to, message: body };
  const res = await axios.post(url, payload, { headers, timeout: 10000 });
  return res.data; // expected to contain message id/status
}

module.exports = { sendSMS };